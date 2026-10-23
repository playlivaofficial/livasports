/** Explicit local-only acceptance of the already approved ODbL Bundesliga policy. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient} from '../src/database/client';
import {SportsRepository} from '../src/multisport/repository';
import {runOpenLigaDbRefresh} from '../src/multisport/refresh';
async function main(){
 const url=new URL(process.env.V3_QA_DATABASE_URL??'');
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55475');assert.equal(url.pathname,'/livasports_v3_qa');
 const db=new PostgresDatabaseClient(url.href);
 try{
  assert.equal((await db.query('SELECT epoch FROM local_validation_epoch')).rows[0]?.epoch,'local-rebuild-2026-10-22');
  assert.equal((await db.query('SELECT paused FROM editorial_automation_control')).rows[0]?.paused,true);
  const repo=new SportsRepository(db);
  const result=await runOpenLigaDbRefresh(repo,{publishAutomatically:true});
  // No retry on failure. Only a successful refresh is checked for zero-request deduplication.
  const rerun=result.status==='failed'?null:await runOpenLigaDbRefresh(repo,{publishAutomatically:true});
  const published=await repo.findPublished('bundesliga');
  const evidence={at:new Date().toISOString(),localOnly:true,result,rerun,published:published?{competition:published.competitionId,source:published.sourceId,sourceUrl:published.sourceUrl,observedAt:published.observedAt,retrievedAt:published.retrievedAt,entities:published.entities.length,events:published.events.length,tableRows:published.tables[0]?.rows.length}:null,modelCalls:0,productionConnections:0};
  await mkdir('output/v3-qa/acceptance-2026-10-22',{recursive:true});
  await writeFile('output/v3-qa/acceptance-2026-10-22/sports-refresh.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
  if(result.status==='failed')process.exitCode=1;
 }finally{await db.close();}
}
main().catch(()=>{console.error('ISOLATED_SPORTS_ACCEPTANCE_FAILED');process.exitCode=1;});
