/** Explicit bounded replay of the two P5 alias corrections. Zero provider calls. */
import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {startOddsJob,endOddsJob,persistSnapshot} from '../src/odds/ingestion';
import type {OddsSnapshot} from '../src/odds/types';
const targets=['id1000039068823316','id1000005472477432'];
if(!process.argv.includes('--apply'))throw Error('Explicit --apply required');
const db=new PostgresDatabaseClient(databaseUrl()!);let job:string|null=null;
try{
  const rows=(await db.query(`SELECT DISTINCT ON(bookmaker,payload->>'tournamentIds') payload FROM odds_sync_snapshots WHERE bookmaker IN ('sportingbet.bet.br','betboo.bet.br') AND observed_at>now()-interval '1 day' AND (payload->'tournamentIds' @> '["390"]'::jsonb OR payload->'tournamentIds' @> '["54"]'::jsonb) ORDER BY bookmaker,payload->>'tournamentIds',observed_at DESC`)).rows;
  const snapshots=rows.map(row=>row.payload as OddsSnapshot).map(s=>({...s,fixtures:s.fixtures.filter(f=>targets.includes(f.providerId)),quotes:s.quotes.filter(q=>targets.includes(q.providerFixtureId))})).filter(s=>s.fixtures.length);
  if(snapshots.length!==4||snapshots.some(s=>s.fixtures.length!==1)||snapshots.reduce((n,s)=>n+s.quotes.length,0)>28)throw Error('UNEXPECTED_REPLAY_SCOPE');
  job=await startOddsJob(db);
  const passes=[];
  for(let pass=0;pass<2;pass++){
    const results=[];
    for(const snapshot of snapshots){const result=await persistSnapshot(db,job,snapshot);results.push({bookmaker:result.bookmaker,matched:result.matchedFixtures,currentWrites:result.current_writes,historyChanges:result.history_changes,closed:result.closed});}
    passes.push(results);
  }
  const idempotent=passes[1].every(r=>r.currentWrites===0&&r.historyChanges===0&&r.closed===0);
  await endOddsJob(db,job,idempotent);job=null;
  const report={at:new Date().toISOString(),providerRequests:0,targets,preservedObservationTimestamps:snapshots.map(s=>s.observedAt),passes,idempotent};
  await writeFile('output/p5-alias-repair-private.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(!idempotent)process.exitCode=1;
}catch(error){console.error(JSON.stringify({error:error instanceof Error?error.message.replace(/[^A-Z_]/g,'').slice(0,80):'REPLAY_FAILED'}));process.exitCode=1;}finally{if(job)await endOddsJob(db,job,false);await db.close();}
