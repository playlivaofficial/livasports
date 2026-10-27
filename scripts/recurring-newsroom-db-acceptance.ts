/** Accelerated synthetic database checks, never evidence of elapsed Production cycles. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
export async function recurringAcceptance(admin:PostgresDatabaseClient,input:URL){
 assert.ok(['localhost','127.0.0.1'].includes(input.hostname));
 const schema='qa_recurring_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const uri=new URL(input);uri.searchParams.set('options',`-c search_path=${schema}`);const db=new PostgresDatabaseClient(uri.href);
 try{
  for(const f of ['072_v2_editorial_newsroom.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql'])await db.query(await readFile('db/migrations/'+f,'utf8'));
  const repo=new AutomationRepository(db);await repo.initialize();await repo.control({paused:false});
  for(const time of ['2026-10-15T00:43:32Z','2026-10-15T06:43:01Z','2026-10-15T12:43:20Z','2026-10-15T18:43:02Z']){
   const now=new Date(time);
   if(time.includes('06:43'))assert.deepEqual(await repo.claim(true,true,now),{reason:'not-due'},'validation retains elapsed six-hour gate');
   const claims=await Promise.all([repo.claim(true,false,now),repo.claim(true,false,now)]);const claim=claims.find(c=>'id' in c);assert.ok(claim&&'id' in claim);assert.equal(claims.filter(c=>'id' in c).length,1);
   await repo.finish(claim.id,{generation:'no-eligible-event',published:[]},{calls:0,inputTokens:0,outputTokens:0,microUsd:0});
   const reconnect=new PostgresDatabaseClient(uri.href);try{const restarted=new AutomationRepository(reconnect);assert.deepEqual(await restarted.claim(true,false,now),{reason:'not-due'});assert.equal((await restarted.dashboard()).paused,false);}finally{await reconnect.close();}
  }
  assert.equal((await db.query('SELECT count(*) FROM editorial_automation_runs')).rows[0].count,'4');
  assert.equal((await db.query('SELECT sum(model_microusd_reserved) FROM editorial_automation_runs')).rows[0].sum,'80000');
  await db.query("INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,model_microusd_reserved) SELECT gen_random_uuid(),'2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:03:00Z'::timestamptz,'completed',20000 FROM generate_series(1,146)");
  assert.deepEqual(await repo.claim(true,false,new Date('2026-10-16T00:43:00Z')),{reason:'model-budget'});
  await repo.control({paused:true});assert.deepEqual(await repo.claim(true,false,new Date('2026-10-16T06:43:00Z')),{reason:'paused'});
  assert.equal((await db.query('SELECT count(*) FROM editorial_news')).rows[0].count,'0');
  return ['recurring UTC slots tolerate cron jitter while validation retains elapsed-time limits','four distinct scheduled windows claim once each across reconnects and concurrent attempts','ordinary completion leaves recurring policy active; emergency pause still stops it','durable conservative reservations and monthly hard stop survive recurring restarts'];
 }finally{await db.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);}
}
