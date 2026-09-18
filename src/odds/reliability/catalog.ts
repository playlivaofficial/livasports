import type {QueryExecutor} from '@/database/client';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
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
  const registry=FOOTBALL_COMPETITION_TARGETS;
  const enabled=new Map(registry.map(t=>[t.slug,t.enabled]));
  return rows.map(r=>{
    const id=String(r.tournamentId),slug=String(r.tournamentSlug),category=String(r.categorySlug);
    const base={tournamentId:id,slug,name:String(r.tournamentName??''),category,categoryName:String(r.categoryName??''),futureFixtures:typeof r.futureFixtures==='number'?r.futureFixtures:null};
    const mapped=resolved.get(id);
    if(mapped)return {...base,state:'MAPPED' as const,competition:mapped,reason:'Resolved through identity rule or unique registry lookup name'};
    const rule=TOURNAMENT_IDENTITY_RULES.find(x=>x.slug===slug&&x.category===category);
    if(rule&&enabled.get(rule.canonical)===false)return {...base,state:'DISABLED' as const,competition:rule.canonical,reason:'Registry competition is disabled'};
    if(rule)return {...base,state:'AMBIGUOUS' as const,competition:rule.canonical,reason:idByCanonical.has(rule.canonical)?`Registry competition already resolves to provider row ${idByCanonical.get(rule.canonical)}; this row matches the same identity rule`:'More than one provider row matches this identity rule'};
    const relevant=registry.filter(t=>t.enabled&&registryCategoryMatches(t,r));
    if(!relevant.length)return {...base,state:'IGNORED_WITH_REASON' as const,competition:null,reason:'Category outside the enabled registry (no LivaSports competition in this country/scope)'};
    const name=normalizeName(r.tournamentName);
    const byName=relevant.filter(t=>[t.canonicalName,...t.lookupNames].map(normalizeName).includes(name));
    if(byName.length>1)return {...base,state:'AMBIGUOUS' as const,competition:null,reason:`Name matches ${byName.length} registry competitions`};
    if(byName.length===1){
      const twins=rows.filter(o=>o!==r&&registryCategoryMatches(byName[0],o)&&[byName[0].canonicalName,...byName[0].lookupNames].map(normalizeName).includes(normalizeName(o.tournamentName)));
      return {...base,state:'AMBIGUOUS' as const,competition:byName[0].slug,reason:twins.length?`Provider lists ${twins.length+1} rows named like ${byName[0].canonicalName}`:'Lookup name matched but the registry already maps this competition to another row'};
    }
    return {...base,state:'UNMATCHED' as const,competition:null,reason:'No identity rule or reviewed lookup name matches this provider row'};
  });
}

/** Persist catalog rows with first/last seen timestamps; rows never disappear because a rule stopped matching them. */
export async function persistCatalogRows(db:QueryExecutor,raw:unknown[]):Promise<{total:number;mapped:number;unmatched:number;ambiguous:number}>{
  const rows=classifyCatalogRows(raw);
  if(rows.length)await db.query(`INSERT INTO odds_catalog_rows(provider,tournament_id,tournament_slug,tournament_name,category_slug,category_name,metadata,mapping_state,mapped_competition,mapping_reason)
    SELECT 'ODDSPAPI',r.tournament_id,r.slug,r.name,r.category,r.category_name,jsonb_build_object('futureFixtures',r.future_fixtures),r.state,r.competition,r.reason
    FROM jsonb_to_recordset($1::jsonb) AS r(tournament_id text,slug text,name text,category text,category_name text,future_fixtures int,state text,competition text,reason text)
    ON CONFLICT(provider,tournament_id) DO UPDATE SET tournament_slug=excluded.tournament_slug,tournament_name=excluded.tournament_name,category_slug=excluded.category_slug,
      category_name=excluded.category_name,metadata=excluded.metadata,last_seen_at=now(),mapping_state=excluded.mapping_state,mapped_competition=excluded.mapped_competition,mapping_reason=excluded.mapping_reason`,
    [JSON.stringify(rows.map(r=>({tournament_id:r.tournamentId,slug:r.slug,name:r.name,category:r.category,category_name:r.categoryName,future_fixtures:r.futureFixtures,state:r.state,competition:r.competition,reason:r.reason})))]);
  return {total:rows.length,mapped:rows.filter(r=>r.state==='MAPPED').length,unmatched:rows.filter(r=>r.state==='UNMATCHED').length,ambiguous:rows.filter(r=>r.state==='AMBIGUOUS').length};
}
