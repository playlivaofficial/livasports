import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const counts=(await db.query(`SELECT
    (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM fixtures) AS fixtures,
    (SELECT count(*) FROM teams) AS teams,(SELECT count(*) FROM players) AS players,
    (SELECT count(*) FROM odds_current) AS current_quotes,(SELECT count(*) FROM odds_history) AS history,
    (SELECT count(*) FROM odds_provider_requests) AS odds_http,
    (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests,
    (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs,
    (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS pending_snapshots,
    (SELECT count(*) FROM product_events WHERE placement='slip-comparison' AND (fixture_id IS NOT NULL OR competition_id IS NOT NULL OR selection_count IS NULL OR markets_summary IS NULL OR selection_count<>(coalesce((markets_summary->>'MATCH_WINNER')::int,0)+coalesce((markets_summary->>'TOTAL_GOALS')::int,0)+coalesce((markets_summary->>'BTTS')::int,0)))) AS invalid_comparison_contexts,
    (SELECT count(*) FROM product_events WHERE (fixture_id IS NULL OR competition_id IS NULL) AND event_name NOT IN ('slip_open','slip_clear','slip_comparison_view','slip_bookmaker_complete','slip_bookmaker_partial','slip_best_price_view','slip_bookmaker_click')) AS invalid_fixture_contexts,
    (SELECT count(*) FROM schema_migrations WHERE filename='011_m7_full_slip_comparison.sql') AS m7_migrations`)).rows[0];
  const events=(await db.query(`SELECT event_name,locale,bookmaker,complete,count(*) AS count FROM product_events WHERE placement='slip-comparison' GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`)).rows;
  const startedSelection={fixturePublicId:'efb9eb4236e54aa8',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION'};
  const response=await fetch('https://livasports.com/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'br',selections:[startedSelection]})});const started=await response.json();
  const postKickoff=response.ok&&started.comparison.states.includes('MATCH_STARTED')&&started.comparison.bookmakers.every((b:{complete:boolean;best:boolean;combinedDecimalOdds:string|null;selectionQuotes:Array<{state:string;decimalOdds:string|null}>})=>!b.complete&&!b.best&&b.combinedDecimalOdds===null&&b.selectionQuotes.every(q=>['MATCH_STARTED','MATCH_FINISHED'].includes(q.state)&&q.decimalOdds===null));
  const pass=Number(counts.competitions)===34&&Number(counts.fixtures)===904&&Number(counts.teams)===1343&&Number(counts.players)===253&&Number(counts.m7_migrations)===1&&['running_jobs','pending_snapshots','invalid_comparison_contexts','invalid_fixture_contexts'].every(k=>Number(counts[k])===0)&&postKickoff;
  const result={at:new Date().toISOString(),status:pass?'PASS':'FAIL',counts,events,realProductionPostKickoffInvalidated:postKickoff,providerRequests:0};await writeFile('output/m7-final-audit-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!pass)process.exitCode=1;
}catch{console.error('M7_FINAL_AUDIT_FAILED; no private configuration logged');process.exitCode=1;}finally{await db.close();}
