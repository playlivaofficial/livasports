import 'server-only';
import type {QueryExecutor} from '@/database/client';
import type {SiteLocale} from '@/config/i18n';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
import {safeAffiliateDestination} from './affiliate';
import {eligibleSource} from './geo';

export interface InternalOddsRead extends OddsReadSnapshot { destinations:Record<string,string>; }
export async function readOddsSnapshot(db:QueryExecutor,fixtureId:string,locale:SiteLocale):Promise<InternalOddsRead>{
  const result=await db.query(`SELECT f.kickoff,f.status AS fixture_status,o.*,b.provider_slug,b.display_name,g.verification_state,
    b.enabled AND b.comparison_enabled AND g.odds_enabled AND g.comparison_enabled AND g.verified_at IS NOT NULL AS geo_eligible,
    fm.livasports_entity_id=f.id AND hm.livasports_entity_id=f.home_team_id AND am.livasports_entity_id=f.away_team_id
      AND cm.livasports_entity_id=f.competition_id AND mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')
      AND (fm.metadata->>'canonicalKickoff')::timestamptz=f.kickoff
      AND (fm.metadata->>'providerKickoff')::timestamptz=o.provider_kickoff AS mapping_verified,
    CASE WHEN b.affiliate_status='ACTIVE' AND g.affiliate_enabled AND al.enabled AND al.approved_at IS NOT NULL
      AND al.campaign_verified AND al.approved_placement='match-odds' THEN al.destination_url END AS destination
    FROM fixtures f LEFT JOIN odds_current o ON o.fixture_id=f.id AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'
    LEFT JOIN bookmakers b ON b.id=o.bookmaker_id
    LEFT JOIN countries co ON co.iso2=$2 LEFT JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id AND g.country_id=co.id
    LEFT JOIN affiliate_links al ON al.bookmaker_id=b.id AND al.country_id=co.id
    LEFT JOIN provider_entity_mappings fm ON fm.provider='ODDSPAPI' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=o.provider_fixture_id
    LEFT JOIN provider_entity_mappings hm ON hm.provider='ODDSPAPI' AND hm.entity_type='TEAM' AND hm.provider_entity_id=fm.metadata->>'homeProviderId'
    LEFT JOIN provider_entity_mappings am ON am.provider='ODDSPAPI' AND am.entity_type='TEAM' AND am.provider_entity_id=fm.metadata->>'awayProviderId'
    LEFT JOIN odds_mapping_reviews mr ON mr.provider_fixture_id=o.provider_fixture_id
    LEFT JOIN provider_entity_mappings cm ON cm.provider='ODDSPAPI' AND cm.entity_type='COMPETITION' AND cm.provider_entity_id=mr.evidence->>'providerCompetitionId'
    WHERE f.id=$1 ORDER BY b.provider_slug,o.market_code,o.outcome_code LIMIT 50`,[fixtureId,locale==='br'?'BR':'MX']);
  const date=(value:unknown)=>value instanceof Date?value.toISOString():typeof value==='string'?value:'';
  const snapshot:InternalOddsRead={kickoff:date(result.rows[0]?.kickoff),fixtureStatus:result.rows[0]?.fixture_status??'UNKNOWN',quotes:[],destinations:{}};
  for(const row of result.rows){if(!row.bookmaker_id)continue;
    const sourceEligible=eligibleSource(row.provider_slug,locale,row.verification_state,row.source_domain);
    const quote:ReadOddsQuote={fixtureId,providerFixtureId:row.provider_fixture_id,bookmaker:row.provider_slug,bookmakerId:row.bookmaker_id,bookmakerName:row.display_name,
      market:row.market_code,outcome:row.outcome_code,line:row.line===null?null:Number(row.line),decimalOdds:String(row.decimal_odds),status:row.status,scope:row.scope,phase:row.phase,
      providerUpdatedAt:row.provider_updated_at?date(row.provider_updated_at):null,observedAt:date(row.observed_at),persistedAt:date(row.persisted_at),lastSuccessfulRefreshAt:date(row.last_successful_refresh_at),
      sourceDomain:row.source_domain,providerKickoff:date(row.provider_kickoff),geoEligible:Boolean(row.geo_eligible&&sourceEligible&&row.mapping_verified)};
    snapshot.quotes.push(quote);
    const destination=quote.geoEligible?safeAffiliateDestination(quote.bookmaker,locale,row.destination):null;
    if(destination)snapshot.destinations[quote.bookmaker]=destination;
  }
  return snapshot;
}
