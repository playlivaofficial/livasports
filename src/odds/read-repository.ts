import 'server-only';
import type {QueryExecutor} from '@/database/client';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
import {activeCampaignSql,availableDestination} from '@/affiliate/availability';
import {eligibleSource,verifiedGeo} from './geo';
import type {QueryResultRow} from 'pg';
import type {BookmakerConfig} from '@/slip/comparison-types';
import {commercialIso2,commercialLocale,type CommercialGeo} from './commercial-geo';

export interface InternalOddsRead extends OddsReadSnapshot { destinations:Record<string,string>; }
// All readers share verified source/mapping checks. Visitor GEO only controls destinations.
function oddsJoin(selector:'id'|'publicIds'|'fixtureIds'){
  const market=selector==='fixtureIds'?" AND o.market_code='MATCH_WINNER' AND o.line IS NULL":'';
  return `LEFT JOIN odds_current o ON o.fixture_id=f.id AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'${market}`;
}
function oddsReadSql(selector:'id'|'publicIds'|'fixtureIds'){
  const where=selector==='id'?'f.id=$1':selector==='publicIds'?'f.public_id=ANY($1::text[]) AND competition.enabled':'f.id=ANY($1::uuid[])';
  const limit=selector==='id'?50:selector==='publicIds'?500:2000;
  return `SELECT f.id AS canonical_fixture_id,f.public_id,f.kickoff,f.status AS fixture_status,
    ht.name AS home_name,at.name AS away_name,
    CASE WHEN $2='BR' THEN competition.display_name_pt_br ELSE competition.display_name_es_mx END AS competition_name,
    o.*,b.provider_slug,b.display_name,g.verification_state,${activeCampaignSql} AS active_campaigns,
    b.enabled AND b.comparison_enabled AND g.odds_enabled AND g.comparison_enabled AND g.verified_at IS NOT NULL AS geo_eligible,
    source_country.iso2 AS source_geo,source_geo.verification_state AS source_verification_state,
    b.enabled AND b.comparison_enabled AND source_geo.odds_enabled AND source_geo.comparison_enabled
      AND source_geo.verified_at IS NOT NULL AS display_eligible,
    fm.livasports_entity_id=f.id AND hm.livasports_entity_id=f.home_team_id AND am.livasports_entity_id=f.away_team_id
      AND cm.livasports_entity_id=f.competition_id AND mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')
      AND (fm.metadata->>'canonicalKickoff')::timestamptz=f.kickoff AS mapping_verified,
    CASE WHEN b.affiliate_status='ACTIVE' AND g.affiliate_enabled AND al.enabled AND al.approved_at IS NOT NULL
      AND al.campaign_verified AND al.approved_placement='match-odds' THEN al.destination_url END AS destination
    FROM fixtures f ${oddsJoin(selector)}
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    JOIN competitions competition ON competition.id=f.competition_id
    LEFT JOIN bookmakers b ON b.id=o.bookmaker_id
    LEFT JOIN countries source_country ON source_country.iso2=CASE
      WHEN lower(o.source_domain) IN ('betsson.mx','www.betsson.mx') THEN 'MX' ELSE 'BR' END
    LEFT JOIN bookmaker_geo_availability source_geo ON source_geo.bookmaker_id=b.id AND source_geo.country_id=source_country.id
    LEFT JOIN countries co ON co.iso2=$2 LEFT JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id AND g.country_id=co.id
    LEFT JOIN affiliate_links al ON al.bookmaker_id=b.id AND al.country_id=co.id
    LEFT JOIN provider_entity_mappings fm ON fm.provider='ODDSPAPI' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=o.provider_fixture_id
    LEFT JOIN provider_entity_mappings hm ON hm.provider='ODDSPAPI' AND hm.entity_type='TEAM' AND hm.provider_entity_id=fm.metadata->>'homeProviderId'
    LEFT JOIN provider_entity_mappings am ON am.provider='ODDSPAPI' AND am.entity_type='TEAM' AND am.provider_entity_id=fm.metadata->>'awayProviderId'
    LEFT JOIN odds_mapping_reviews mr ON mr.provider_fixture_id=o.provider_fixture_id
    LEFT JOIN provider_entity_mappings cm ON cm.provider='ODDSPAPI' AND cm.entity_type='COMPETITION' AND cm.provider_entity_id=mr.evidence->>'providerCompetitionId'
    WHERE ${where}
    ORDER BY f.public_id,b.provider_slug,o.market_code,o.outcome_code LIMIT ${limit}`;
}
function hydrateOddsSnapshot(rows:QueryResultRow[],fixtureId:string,geo:CommercialGeo|null):InternalOddsRead {
  const date=(value:unknown)=>value instanceof Date?value.toISOString():typeof value==='string'?value:'';
  const locale=commercialLocale(geo);
  const snapshot:InternalOddsRead={kickoff:date(rows[0]?.kickoff),fixtureStatus:String(rows[0]?.fixture_status??'UNKNOWN'),quotes:[],destinations:{}};
  for(const row of rows){if(!row.bookmaker_id)continue;
    // A BR feed remains BR content wherever it is read; this grants no commercial eligibility.
    const sourceEligible=eligibleSource(row.provider_slug,row.source_geo,row.source_verification_state,row.source_domain);
    const commercialEligible=row.geo_eligible&&eligibleSource(row.provider_slug,geo,row.verification_state,row.source_domain);
    const quote:ReadOddsQuote={fixtureId,providerFixtureId:row.provider_fixture_id,bookmaker:row.provider_slug,bookmakerId:row.bookmaker_id,bookmakerName:row.display_name,
      market:row.market_code,outcome:row.outcome_code,line:row.line===null?null:Number(row.line),decimalOdds:String(row.decimal_odds),status:row.status,scope:row.scope,phase:row.phase,
      providerUpdatedAt:row.provider_updated_at?date(row.provider_updated_at):null,observedAt:date(row.observed_at),persistedAt:date(row.persisted_at),lastSuccessfulRefreshAt:date(row.last_successful_refresh_at),
      sourceDomain:row.source_domain,providerKickoff:date(row.provider_kickoff),freshnessTtlMinutes:row.freshness_ttl_minutes==null?null:Number(row.freshness_ttl_minutes),geoEligible:Boolean(row.display_eligible&&sourceEligible&&row.mapping_verified)};
    snapshot.quotes.push(quote);
    const destination=quote.geoEligible&&commercialEligible&&locale?availableDestination(quote.bookmaker,locale,row.destination,row.active_campaigns,'match_odds_table')?.url:null;
    if(destination)snapshot.destinations[quote.bookmaker]=destination;
  }
  return snapshot;
}

export async function readOddsSnapshot(db:QueryExecutor,fixtureId:string,geo:CommercialGeo|null):Promise<InternalOddsRead>{
  const result=await db.query(oddsReadSql('id'),[fixtureId,commercialIso2(geo)]);
  return hydrateOddsSnapshot(result.rows,fixtureId,geo);
}

const LISTING_CHUNK=80;
const FIXTURE_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readListingOddsSnapshots(db:QueryExecutor,fixtureIds:readonly string[],geo:CommercialGeo|null):Promise<Map<string,InternalOddsRead>>{
  const unique=[...new Set(fixtureIds.filter(id=>FIXTURE_UUID.test(id)))];
  const snapshots=new Map<string,InternalOddsRead>();
  for(let i=0;i<unique.length;i+=LISTING_CHUNK){
    const chunk=unique.slice(i,i+LISTING_CHUNK);
    const result=await db.query(oddsReadSql('fixtureIds'),[chunk,commercialIso2(geo)]);
    const groups=new Map<string,typeof result.rows>();
    for(const row of result.rows){const id=String(row.canonical_fixture_id);const rows=groups.get(id)??[];rows.push(row);groups.set(id,rows);}
    for(const [id,rows] of groups)snapshots.set(id,hydrateOddsSnapshot(rows,id,geo));
  }
  return snapshots;
}

export interface PublicOddsFixtureRead {
  fixture:{publicId:string;home:string;away:string;competition:string;kickoff:string;status:string};
  snapshot:OddsReadSnapshot;
}
export async function readPublicOddsFixtures(db:QueryExecutor,publicIds:readonly string[],geo:CommercialGeo|null):Promise<Map<string,PublicOddsFixtureRead>>{
  if(publicIds.length>10||publicIds.some(id=>!/^[a-f0-9]{16}$/.test(id)))throw new Error('INVALID_SLIP_FIXTURES');
  const ids=[...new Set(publicIds)];
  if(!ids.length)return new Map();
  const result=await db.query(oddsReadSql('publicIds'),[ids,commercialIso2(geo)]);
  const groups=new Map<string,typeof result.rows>();
  for(const row of result.rows){const id=String(row.public_id);const rows=groups.get(id)??[];rows.push(row);groups.set(id,rows);}
  return new Map([...groups].map(([id,rows])=>{
    const internal=hydrateOddsSnapshot(rows,String(rows[0].canonical_fixture_id),geo);
    return [id,{fixture:{publicId:id,home:String(rows[0].home_name),away:String(rows[0].away_name),competition:String(rows[0].competition_name),kickoff:internal.kickoff,status:internal.fixtureStatus},
      // Destinations are intentionally excluded: M6 resolves intent, not commercial actions.
      snapshot:{kickoff:internal.kickoff,fixtureStatus:internal.fixtureStatus,quotes:internal.quotes}}];
  }));
}

export interface SlipComparisonRead {fixtures:Map<string,PublicOddsFixtureRead>;bookmakers:BookmakerConfig[];destinations:Record<string,string>;}
export async function readSlipComparison(db:QueryExecutor,publicIds:readonly string[],geo:CommercialGeo|null):Promise<SlipComparisonRead>{
  // Two bounded queries regardless of selection/bookmaker count. No history or provider gateway.
  const fixtures=await readPublicOddsFixtures(db,publicIds,geo);
  if(!publicIds.length)return {fixtures,bookmakers:[],destinations:{}};
  const comparisonGeo=geo??'BR';
  const locale=commercialLocale(geo)??'br';
  const {rows}=await db.query(`SELECT b.provider_slug,b.display_name,b.affiliate_status,g.verification_state,${activeCampaignSql} AS active_campaigns,
    CASE WHEN b.affiliate_status='ACTIVE' AND g.affiliate_enabled AND al.enabled AND al.approved_at IS NOT NULL
      AND al.campaign_verified AND al.approved_placement='match-odds' THEN al.destination_url END AS destination
    FROM bookmakers b JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id
    JOIN countries c ON c.id=g.country_id
    LEFT JOIN affiliate_links al ON al.bookmaker_id=b.id AND al.country_id=c.id
    WHERE c.iso2=$1 AND b.enabled AND b.comparison_enabled AND g.odds_enabled AND g.comparison_enabled
      AND g.verified_at IS NOT NULL AND b.provider_slug IN ('betsson','betano.bet.br')
    ORDER BY b.provider_slug LIMIT 4`,[comparisonGeo]);
  const destinations:Record<string,string>={};const bookmakers:BookmakerConfig[]=[];
  for(const row of rows){
    if(!verifiedGeo(row.verification_state,comparisonGeo)||(row.provider_slug==='betano.bet.br'&&comparisonGeo!=='BR'))continue;
    if(bookmakers.some(b=>b.bookmakerId===row.provider_slug))throw new Error('AMBIGUOUS_BOOKMAKER_CONFIGURATION');
    const configured=geo?availableDestination(row.provider_slug,locale,row.destination,row.active_campaigns,'slip_bookmaker_comparison'):null;
    const destination=configured?.url??null;
    if(destination)destinations[row.provider_slug]=destination;
    bookmakers.push({bookmakerId:row.provider_slug,displayName:row.display_name,geoEligibility:{locale,eligible:true},
      affiliateEligibility:{approved:!!geo&&row.affiliate_status==='ACTIVE',destinationConfigured:destination!==null,...(configured?{destinationType:configured.type}:{})}});
  }
  return {fixtures,bookmakers,destinations};
}
