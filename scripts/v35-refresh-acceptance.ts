import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient} from '../src/database/client';
import {SportsRepository,snapshotHash} from '../src/multisport/repository';
import {runOpenLigaDbRefresh} from '../src/multisport/refresh';
async function main(){
 const url=new URL(process.env.V35_LOCAL_REFRESH_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55475');assert.equal(url.pathname,'/livasports_v3_qa');
 const db=new PostgresDatabaseClient(url.href,undefined,{statementTimeoutMs:5000});
 try{
  const repo=new SportsRepository(db),startedAt=new Date().toISOString();
  assert.equal((await db.query('SELECT paused FROM editorial_automation_control')).rows[0].paused,true);
  const before=await repo.listOwner(),auditsBefore=Number((await db.query('SELECT count(*) FROM sports_snapshot_audit')).rows[0].count);
  const result=await runOpenLigaDbRefresh(repo,{publishAutomatically:true});
  // Actual wall clock, unchanged durable lease. Failure has no second network attempt.
  const rerun=result.status==='failed'?null:await runOpenLigaDbRefresh(repo,{publishAutomatically:true});
  if(rerun)assert.deepEqual({status:rerun.status,requests:rerun.requests},{status:'not-due',requests:0});
  const after=await repo.listOwner(),auditsAfter=Number((await db.query('SELECT count(*) FROM sports_snapshot_audit')).rows[0].count);
  for(const row of before.filter(r=>r.key!=='bundesliga:2026/27'))assert.deepEqual(after.find(r=>r.key===row.key),row);
  if(['unchanged','not-due','failed'].includes(result.status))assert.equal(auditsAfter,auditsBefore);
  const published=await repo.findPublished('bundesliga'),state=(await repo.refreshStatus()).find(r=>r.sourceKey==='openligadb:bl1:2026');
  assert.equal((await db.query('SELECT paused FROM editorial_automation_control')).rows[0].paused,true);
  const evidence={startedAt,finishedAt:new Date().toISOString(),localOnly:true,result,rerun,auditDelta:auditsAfter-auditsBefore,otherSnapshotsPreserved:true,newsroomPaused:true,modelCalls:0,productionConnections:0,refresh:state?{lastSuccessAt:state.lastSuccessAt,nextAllowedAt:state.nextAllowedAt,failures:state.failures,lastError:state.lastError}:null,published:published?{hash:snapshotHash(published),sourceDate:published.observedAt,teams:published.entities.length,completed:published.events.filter(e=>e.status==='completed').length}:null,limitation:'One real due execution plus immediate gate verification is not repeated six-hour operation.'};
  const out='output/v3-qa/v35/refresh';await mkdir(out,{recursive:true});await writeFile(out+'/'+startedAt.replaceAll(':','-')+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
  if(result.status==='failed')process.exitCode=1;
 }finally{await db.close();}
}
main().catch(()=>{console.error('ISOLATED_REFRESH_CHECK_FAILED');process.exitCode=1;});
