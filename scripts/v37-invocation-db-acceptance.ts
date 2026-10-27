/** Synthetic isolated schema only: operational history must not mutate financial/editorial history. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {beginInvocation,finishInvocation} from '../src/editorial/automation/invocations';
export async function invocationAcceptance(admin:PostgresDatabaseClient,input:URL){
 assert.ok(['127.0.0.1','localhost'].includes(input.hostname));
 const schema='qa_invocations_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const uri=new URL(input);uri.searchParams.set('options',`-c search_path=${schema}`);const db=new PostgresDatabaseClient(uri.href);
 try{
  for(const file of ['072_v2_editorial_newsroom.sql','074_v3_news_automation.sql'])await db.query(await readFile('db/migrations/'+file,'utf8'));
  await db.query("INSERT INTO editorial_automation_audit(action,detail,recorded_at) VALUES ('scheduler-invocation','{}',now()-interval '31 days'),('canary-consumed','{}',now()-interval '31 days'),('historical-reservation','{}',now()-interval '31 days')");
  const ids=await Promise.all([beginInvocation(db,'vercel-cron/1.0'),beginInvocation(db,'private-user-agent-must-not-persist')]);
  assert.notEqual(ids[0],ids[1]);
  await finishInvocation(db,ids[0],{status:'disabled'},'not-needed');
  const reconnect=new PostgresDatabaseClient(uri.href);
  try{
   const rows=(await reconnect.query('SELECT action,detail FROM editorial_automation_audit ORDER BY id')).rows;
   assert.equal(rows.length,4);assert.ok(rows.some(x=>x.action==='canary-consumed'));assert.ok(rows.some(x=>x.action==='historical-reservation'));
   const invocations=rows.filter(x=>x.action==='scheduler-invocation');
   assert.equal(invocations[0].detail.outcome,'no-op');assert.equal(invocations[1].detail.outcome,'incomplete');
   assert.equal(invocations[1].detail.finishedAt,null);assert.doesNotMatch(JSON.stringify(rows),/private-user-agent/);
   assert.equal((await reconnect.query('SELECT count(*) FROM editorial_automation_runs')).rows[0].count,'0');
   assert.equal((await reconnect.query('SELECT count(*) FROM editorial_automation_events')).rows[0].count,'0');
   await finishInvocation(reconnect,ids[1],{status:'failed'},'not-reached');
   assert.equal((await db.query('SELECT detail FROM editorial_automation_audit WHERE id=$1',[ids[1]])).rows[0].detail.outcome,'failed');
  }finally{await reconnect.close();}
  return ['invocation start/end and incomplete crash evidence survive physical reconnect','concurrent telemetry records remain independent; disabled invocations create no run, event or reservation','30-day telemetry cleanup preserves financial and consumed-grant audit history','raw user-agent is not persisted'];
 }finally{await db.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);}
}
