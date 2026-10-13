import type {QueryExecutor} from '@/database/client';
import type {CommercialGeo} from './commercial-geo';
import {readVerifiedOperatorFeeds} from './operator-feeds';
import {pipelineAvailability,type OddsAvailability} from './availability';

/** Bounded DB-only explanation. Unknown coverage is never presented as proven upstream absence. */
export async function readOddsAvailability(db:QueryExecutor,fixtureId:string,geo:CommercialGeo|null):Promise<Record<string,OddsAvailability>>{
  if(!geo)return {};
  const feeds=(await readVerifiedOperatorFeeds(db)).filter(f=>f.geo===geo);
  if(!feeds.length)return {};
  const {rows}=await db.query(`SELECT p.bookmaker,t.last_error,t.last_outcome,
    EXISTS(SELECT 1 FROM odds_scheduler_health WHERE state='BUDGET_STOPPED') AS quota_blocked,
    EXISTS(SELECT 1 FROM odds_provider_requests r WHERE (r.http_status IN (401,403,429) OR r.http_status>=500 OR r.outcome='NETWORK_ERROR')
      AND r.started_at>now()-interval '6 hours' AND r.started_at>COALESCE(
        (SELECT max(started_at) FROM odds_provider_requests WHERE billable AND outcome='SUCCEEDED'),'-infinity'::timestamptz)) AS provider_error,
    EXISTS(SELECT 1 FROM odds_native_diagnostics d WHERE d.fixture_id=f.id AND d.bookmaker=p.bookmaker
      AND d.observed_at=t.last_checked_at AND d.observed_at>now()-interval '12 hours'
      GROUP BY d.fixture_id,d.bookmaker HAVING bool_and(d.classification='PROVIDER_GAP')
        AND count(DISTINCT (d.market,d.outcome))>=7) AS confirmed_gap
    FROM fixtures f CROSS JOIN unnest($2::text[]) p(bookmaker)
    LEFT JOIN provider_entity_mappings cm ON cm.provider='ODDSPAPI' AND cm.entity_type='COMPETITION' AND cm.livasports_entity_id=f.competition_id
    LEFT JOIN odds_refresh_targets t ON t.bookmaker=p.bookmaker AND t.tournament_id=cm.provider_entity_id
    WHERE f.id=$1`,[fixtureId,[...new Set(feeds.map(f=>f.providerBookmakerId))]]);
  return Object.fromEntries(feeds.map(feed=>{const row=rows.find(r=>r.bookmaker===feed.providerBookmakerId);return [feed.operatorId,pipelineAvailability({error:row?.last_error,providerError:row?.provider_error===true,outcome:row?.last_outcome,quotaBlocked:row?.quota_blocked===true,confirmedGap:row?.confirmed_gap===true})];}));
}
