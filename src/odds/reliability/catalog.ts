import type {QueryExecutor} from '@/database/client';
import {APPROVED_COMPETITION_TARGETS,isAcquisitionCompetition} from '@/config/footballCompetitions';
import {TOURNAMENT_IDENTITY_RULES,normalizeName,registryCategoryMatches,resolveCatalogTournaments} from '@/providers/oddspapi/tournament-catalog';
import type {CatalogMappingState} from './classify';

export interface CatalogRowState {
  tournamentId:string;slug:string;name:string;category:string;categoryName:string;futureFixtures:number|null;
  state:Exclude<CatalogMappingState,'NONE'>;competition:string|null;reason:string;
}
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

/**
 * Catalog self-healing (P3 §11): every well-formed provider row gets an explicit, deterministic mapping state.
 * Order: known identity rule (slug+category) → registry lookup names inside the matching country/clubs category
 * → unique normalized competition name. Ambiguous candidates are never auto-mapped.
 */
export function classifyCatalogRows(raw:unknown[]):CatalogRowState[]{
  const rows=(Array.isArray(raw)?raw:[]).map(obj).filter(r=>/^[0-9]{1,10}$/.test(String(r.tournamentId??''))&&typeof r.tournamentSlug==='string'&&typeof r.categorySlug==='string');
  const resolvedRows=resolveCatalogTournaments(rows);
  const resolved=new Map(resolvedRows.map(t=>[t.id,t.canonical]));
  const idByCanonical=new Map(resolvedRows.map(t=>[t.canonical,t.id]));
  const registry=APPROVED_COMPETITION_TARGETS.filter(target=>isAcquisitionCompetition(target.slug));
  const enabled=new Map(registry.map(t=>[t.slug,t.enabled]));
  return rows.map(r=>{
    const id=String(r.tournamentId),slug=String(r.tournamentSlug),category=String(r.categorySlug);
    const base={tournamentId:id,slug,name:String(r.tournamentName??''),category,categoryName:String(r.categoryName??''),futureFixtures:typeof r.futureFixtures==='number'?r.futureFixtures:null};
    const mapped=resolved.get(id);
    if(mapped)return {...base,state:'MAPPED' as const,competition:mapped,reason:'Resolved through identity rule or unique registry lookup name'};
    const rule=TOURNAMENT_IDENTITY_RULES.find(x=>x.slug===slug&&x.category===category);
    if(rule&&!isAcquisitionCompetition(rule.canonical))return {...base,state:'IGNORED_WITH_REASON' as const,competition:rule.canonical,reason:'Historical or child competition is outside the approved standalone acquisition inventory; evidence is retained'};
    if(rule&&enabled.get(rule.canonical)===false)return {...base,state:'DISABLED' as const,competition:rule.canonical,reason:'Registry competition is disabled'};
    if(rule&&idByCanonical.has(rule.canonical)){
      // A second row for an already-resolved competition (split-season phase, legacy name): a real candidate only while it carries fixtures.
      const active=(base.futureFixtures??0)>0;
      return {...base,state:active?'AMBIGUOUS' as const:'IGNORED_WITH_REASON' as const,competition:rule.canonical,
        reason:`Registry competition already resolves to provider row ${idByCanonical.get(rule.canonical)}; this row matches the same identity rule${active?'':' and lists no upcoming fixtures'}`};
    }
    if(rule)return {...base,state:'AMBIGUOUS' as const,competition:rule.canonical,reason:'More than one provider row matches this identity rule'};
    const relevant=registry.filter(t=>t.enabled&&registryCategoryMatches(t,r));
    if(!relevant.length)return {...base,state:'IGNORED_WITH_REASON' as const,competition:null,reason:'Category outside the enabled registry (no LivaSports competition in this country/scope)'};
    // Deliberate exclusion: when every enabled registry competition of this category already resolves to a provider row,
    // the remaining rows are competitions LivaSports does not offer, not mapping gaps. They stay quarantined as evidence.
    const unmappedInCategory=relevant.filter(t=>!idByCanonical.has(t.slug));
    const name=normalizeName(r.tournamentName);
    const byName=relevant.filter(t=>[t.canonicalName,...t.lookupNames].map(normalizeName).includes(name));
    if(byName.length>1)return {...base,state:'AMBIGUOUS' as const,competition:null,reason:`Name matches ${byName.length} registry competitions`};
    if(byName.length===1){
      const twins=rows.filter(o=>o!==r&&registryCategoryMatches(byName[0],o)&&[byName[0].canonicalName,...byName[0].lookupNames].map(normalizeName).includes(normalizeName(o.tournamentName)));
      if(twins.length)return {...base,state:'AMBIGUOUS' as const,competition:byName[0].slug,reason:`Provider lists ${twins.length+1} rows named like ${byName[0].canonicalName}`};
      const active=(base.futureFixtures??0)>0;
      return {...base,state:active?'AMBIGUOUS' as const:'IGNORED_WITH_REASON' as const,competition:byName[0].slug,reason:`Lookup name matched but the registry already maps this competition to provider row ${idByCanonical.get(byName[0].slug)}${active?'':'; this row lists no upcoming fixtures'}`};
    }
    if(!unmappedInCategory.length)return {...base,state:'IGNORED_WITH_REASON' as const,competition:null,reason:`Not a LivaSports competition: every enabled registry competition in ${category} already resolves to a provider row`};
    return {...base,state:'UNMATCHED' as const,competition:null,reason:`No identity rule or reviewed lookup name matches; candidates still unmapped in this category: ${unmappedInCategory.map(t=>t.slug).join(', ')}`};
  });
}

/** Persist catalog rows with first/last seen timestamps; rows never disappear because a rule stopped matching them. */
export async function persistCatalogRows(db:QueryExecutor,raw:unknown[]):Promise<{total:number;mapped:number;unmatched:number;ambiguous:number}>{
  const rows=classifyCatalogRows(raw);
  const observation=(await db.query("SELECT verified_at FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.verified_at??null;
  if(rows.length)await db.query(`INSERT INTO odds_catalog_rows(provider,tournament_id,tournament_slug,tournament_name,category_slug,category_name,metadata,mapping_state,mapped_competition,mapping_reason,
      normalized_name,candidate_competitions,confidence,source_observed_at,last_seen_at,reconciled_at)
    SELECT 'ODDSPAPI',r.tournament_id,r.slug,r.name,r.category,r.category_name,jsonb_build_object('futureFixtures',r.future_fixtures),r.state,r.competition,r.reason,
      r.normalized,r.candidates,r.confidence,$2::timestamptz,COALESCE($2::timestamptz,now()),now()
    FROM jsonb_to_recordset($1::jsonb) AS r(tournament_id text,slug text,name text,category text,category_name text,future_fixtures int,state text,competition text,reason text,normalized text,candidates jsonb,confidence text)
    ON CONFLICT(provider,tournament_id) DO UPDATE SET tournament_slug=excluded.tournament_slug,tournament_name=excluded.tournament_name,category_slug=excluded.category_slug,
      category_name=excluded.category_name,metadata=excluded.metadata,last_seen_at=COALESCE(excluded.source_observed_at,odds_catalog_rows.last_seen_at),
      mapping_state=excluded.mapping_state,mapped_competition=excluded.mapped_competition,mapping_reason=excluded.mapping_reason,
      normalized_name=excluded.normalized_name,candidate_competitions=excluded.candidate_competitions,confidence=excluded.confidence,reconciled_at=now(),
      occurrence_count=odds_catalog_rows.occurrence_count+CASE WHEN odds_catalog_rows.source_observed_at IS NOT NULL AND odds_catalog_rows.source_observed_at<excluded.source_observed_at THEN 1 ELSE 0 END,
      source_observed_at=COALESCE(excluded.source_observed_at,odds_catalog_rows.source_observed_at)`,
    [JSON.stringify(rows.map(r=>({tournament_id:r.tournamentId,slug:r.slug,name:r.name,category:r.category,category_name:r.categoryName,future_fixtures:r.futureFixtures,state:r.state,competition:r.competition,reason:r.reason,
      normalized:normalizeName(r.name),candidates:r.competition?[r.competition]:[],confidence:r.state==='MAPPED'?'DETERMINISTIC_EXACT':r.state==='AMBIGUOUS'?'AMBIGUOUS':'UNRESOLVED'}))),observation]);
  return {total:rows.length,mapped:rows.filter(r=>r.state==='MAPPED').length,unmatched:rows.filter(r=>r.state==='UNMATCHED').length,ambiguous:rows.filter(r=>r.state==='AMBIGUOUS').length};
}
