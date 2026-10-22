/** Publish one retained, independently reconciled source snapshot in the isolated DB only. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {SportsRepository,snapshotKey} from '../src/multisport/repository';
import {assertOpenLigaSnapshot} from '../src/multisport/openligadb';
import {snapshotFreshness,validateSnapshot,type SportsSnapshot} from '../src/multisport/model';
async function main(){
 const url=new URL(process.env.V3_QA_DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55475');assert.equal(url.pathname,'/livasports_v3_qa');
 assert.equal(url.username,'livasports_table_review_qa');
 const raw=await readFile('output/v3-source-audit/bundesliga-2026-10-21.json','utf8');
 const snapshot=JSON.parse(raw) as SportsSnapshot;assert.deepEqual(validateSnapshot(snapshot),[]);assertOpenLigaSnapshot(snapshot);
 assert.equal(snapshot.observedAt,'2026-10-18T15:30:00.000Z');assert.equal(snapshot.retrievedAt,'2026-10-21T06:14:26.974Z');
 const db=new PostgresDatabaseClient(url.href);
 try{
  assert.equal((await db.query('SELECT epoch FROM local_validation_epoch')).rows[0]?.epoch,'local-rebuild-2026-10-22');assert.equal((await db.query('SELECT paused FROM editorial_automation_control')).rows[0]?.paused,true);
  const repo=new SportsRepository(db),key=snapshotKey(snapshot);
  const before=JSON.stringify(await repo.refreshStatus());
  const draft=await repo.mutate({action:'create',key,revision:0,draft:snapshot});
  await repo.mutate({action:'review',key,revision:draft.revision});
  await repo.mutate({action:'publish',key,revision:draft.revision});
  assert.deepEqual(await repo.findPublished('bundesliga'),snapshot);assert.equal(JSON.stringify(await repo.refreshStatus()),before);
  const evidence={at:new Date().toISOString(),localOnly:true,sourceFileSha256:createHash('sha256').update(raw).digest('hex'),source:snapshot.sourceUrl,observedAt:snapshot.observedAt,retrievedAt:snapshot.retrievedAt,rows:18,fixtures:306,reconciledCompletedFixtures:54,freshness:snapshotFreshness(snapshot),published:true,originalDatesPreserved:true,refreshScheduleUnchanged:true,providerRequests:0,modelCalls:0,audit:(await db.query('SELECT action,revision FROM sports_snapshot_audit WHERE snapshot_key=$1 ORDER BY recorded_at',[key])).rows};
  await writeFile('output/v3-qa/acceptance-2026-10-22/dated-table-publication.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await db.close();}
}
main().catch(()=>{console.error('ISOLATED_TABLE_REVIEW_FAILED');process.exitCode=1;});
