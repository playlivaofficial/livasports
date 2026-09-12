import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {runMigrations} from '../src/database/migrate';
import {persistSnapshot,startOddsJob,endOddsJob} from '../src/odds/ingestion';
import {schedulerHealth,schedulerPlan,runOddsScheduler,safeSchedulerError} from '../src/odds/scheduler';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const command=process.argv[2]??'plan';let result:unknown;
  if(command==='migrate')result={applied:await runMigrations(db)};
  else if(command==='run')result=await runOddsScheduler(db,process.env.ODDSPAPI_API_KEY!);
  else if(command==='plan')result={plan:await schedulerPlan(db),health:await schedulerHealth(db)};
  else if(command==='replay'){
    const id=await startOddsJob(db);let ok=false;
    try{
      let duplicateLock=false;try{await startOddsJob(db);}catch(error){duplicateLock=safeSchedulerError(error)==='ODDS_WORKER_ALREADY_RUNNING';}
      if(!duplicateLock)throw new Error('ODDS_DUPLICATE_LEASE_TEST_FAILED');
      const snapshots=(await db.query(`SELECT DISTINCT ON(bookmaker,payload->'tournamentIds') payload FROM odds_sync_snapshots
        WHERE applied_at IS NOT NULL ORDER BY bookmaker,payload->'tournamentIds',observed_at DESC LIMIT 8`)).rows;
      const first=[];for(const row of snapshots)first.push(await persistSnapshot(db,id,row.payload));
      const second=[];for(const row of snapshots)second.push(await persistSnapshot(db,id,row.payload));
      const summarize=(rows:typeof first)=>rows.map(r=>({bookmaker:r.bookmaker,currentWrites:r.current_writes,historyChanges:r.history_changes,closed:r.closed}));
      const writes=second.reduce((n,r)=>n+r.current_writes+r.history_changes+(r.closed??0),0);
      if(writes!==0)throw new Error('ODDS_REPLAY_NOT_IDEMPOTENT');
      result={duplicateLock,providerRequests:0,first:summarize(first),second:summarize(second),idempotent:writes===0};ok=true;
    }finally{await endOddsJob(db,id,ok);}
  }else if(command==='audit'){
    const health=await schedulerHealth(db);const plan=await schedulerPlan(db);
    const integrity=(await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS enabled_competitions,
      (SELECT count(*) FROM fixtures) AS fixtures,(SELECT count(*) FROM odds_current) AS current_quotes,(SELECT count(*) FROM odds_history) AS history,
      (SELECT count(*) FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE') AS odds_fixture_mappings,
      (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS unapplied_snapshots,
      (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs,
      (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line FROM odds_current GROUP BY 1,2,3,4,5 HAVING count(*)>1)d) AS duplicate_quotes,
      (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line,observed_at,status,decimal_odds FROM odds_history GROUP BY 1,2,3,4,5,6,7,8 HAVING count(*)>1)d) AS duplicate_history,
      (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id LEFT JOIN bookmakers b ON b.id=o.bookmaker_id WHERE f.id IS NULL OR b.id IS NULL) AS orphan_quotes,
      (SELECT count(*) FROM odds_history o LEFT JOIN fixtures f ON f.id=o.fixture_id LEFT JOIN bookmakers b ON b.id=o.bookmaker_id WHERE f.id IS NULL OR b.id IS NULL) AS orphan_history,
      (SELECT count(*) FROM affiliate_links WHERE enabled AND approved_at IS NOT NULL AND campaign_verified) AS approved_affiliate_links`)).rows[0];
    const requests=(await db.query(`SELECT endpoint,purpose,billable,http_status,outcome,count(*) AS calls FROM odds_provider_requests
      WHERE started_at>=$1 GROUP BY 1,2,3,4,5 ORDER BY 1,2`,['2026-09-12T12:20:00Z'])).rows;
    const jobs=(await db.query("SELECT id,status,trigger_source,provider_requests,started_at,completed_at,error_code,result FROM odds_sync_jobs WHERE trigger_source IN ('CONTROLLED','AUTOMATIC') ORDER BY started_at")).rows;
    result={at:new Date().toISOString(),integrity,requests,jobs,health,plan};
    if(['duplicate_quotes','duplicate_history','orphan_quotes','orphan_history'].some(k=>Number(integrity[k])!==0))process.exitCode=1;
  }else throw new Error('ODDS_UNKNOWN_COMMAND');
  await writeFile(`output/m5-1-${command}-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch(error){console.error(safeSchedulerError(error));process.exitCode=1;}finally{await db.close();}
