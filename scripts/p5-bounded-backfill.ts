import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {M5OddsPapiAdapter} from '../src/providers/oddspapi/M5OddsPapiAdapter';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
import {startOddsJob,endOddsJob,persistSnapshot} from '../src/odds/ingestion';
import {budgetHealth,reconcileAccountPeriod} from '../src/odds/budget';

// Explicit, bounded post-release operation. Never imported by a route or automatically retried.
if(process.argv[2]!=='--after-ready')throw new Error('VERIFY_EXISTING_PRODUCTION_DEPLOYMENT_READY_FIRST');
const db=new PostgresDatabaseClient(databaseUrl()!);
let job:string|null=null;
try{
  const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
  if(!catalog)throw new Error('CATALOG_NOT_VERIFIED');
  const tournaments=schedulerTournaments(catalog.tournaments);
  const upcoming=(await db.query(`SELECT c.slug,min(f.kickoff) AS first_kickoff FROM fixtures f
    JOIN competitions c ON c.id=f.competition_id AND c.enabled WHERE f.status='SCHEDULED'
    AND f.kickoff>now() AND f.kickoff<=now()+interval '7 days' GROUP BY c.slug ORDER BY first_kickoff,c.slug`)).rows;
  const selected=upcoming.flatMap(row=>tournaments.filter(t=>t.canonical===row.slug)).slice(0,8);
  if(!selected.length)throw new Error('NO_UPCOMING_MAPPED_SAMPLE');
  job=await startOddsJob(db);
  const provider=new M5OddsPapiAdapter(db,process.env.ODDSPAPI_API_KEY!,job,5,false,Date.now()+140000,tournaments,0);
  await reconcileAccountPeriod(db,await provider.accountPeriod());
  const results=[];
  for(let offset=0;offset<selected.length;offset+=4){
    const ids=selected.slice(offset,offset+4).map(t=>t.id);
    for(const bookmaker of ['sportingbet.bet.br','betboo.bet.br']){
      const snapshot=await provider.snapshot(bookmaker,ids);
      const first=await persistSnapshot(db,job,snapshot);
      // Reuse the identical provider response: idempotency costs zero provider requests.
      const replay=await persistSnapshot(db,job,snapshot);
      if(replay.current_writes||replay.history_changes||replay.closed)throw new Error('IDEMPOTENCY_FAILED');
      results.push({tournamentIds:ids,...first,replay:{currentWrites:replay.current_writes,historyChanges:replay.history_changes,closed:replay.closed}});
    }
  }
  const requests=(await db.query('SELECT endpoint,safe_query,http_status,outcome,billable FROM odds_provider_requests WHERE job_id=$1 ORDER BY started_at',[job])).rows;
  await endOddsJob(db,job,true);job=null;
  const report={at:new Date().toISOString(),requests:provider.requestCount(),http:requests,tournaments:selected,results,budget:await budgetHealth(db),idempotency:'PASS'};
  await writeFile('output/p5-backfill-private.json',JSON.stringify(report,null,2));
  console.info(JSON.stringify(report));
}catch(error){
  // Do not echo arbitrary provider bodies, URLs, or database error details.
  console.error(JSON.stringify({status:'STOPPED',error:error instanceof Error?error.name:'UNKNOWN',details:'See sanitized request ledger; no automatic retries.'}));
  process.exitCode=1;
}finally{if(job)await endOddsJob(db,job,false);await db.close();}
