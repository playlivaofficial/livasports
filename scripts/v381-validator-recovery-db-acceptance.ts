/** Synthetic, local-only transactional acceptance; no source or model network calls. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
import {extractAnnouncement} from '../src/editorial/automation/announcements';
import {fingerprint,stableFacts,toNewsDraft,type GeneratedCopy} from '../src/editorial/automation/policy';
import {validatorCorrection} from '../src/editorial/automation/validator-recovery';
import type {ReviewEvidence} from '../src/editorial/automation/review';
export async function validatorRecoveryAcceptance(admin:PostgresDatabaseClient,input:URL){
 assert.ok(['localhost','127.0.0.1'].includes(input.hostname));
 const schema='qa_validator_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const uri=new URL(input);uri.searchParams.set('options',`-c search_path=${schema}`);const db=new PostgresDatabaseClient(uri.href);
 const now=new Date(),old=new Date(+now-7*3600000),sourceDate=new Date(+now-86400000).toISOString().slice(0,10);
 const facts=extractAnnouncement({desk:'nba-releases',url:'https://pr.nba.com/synthetic-recovery',headline:'NBA Tip-Off on NBC and Peacock delivers most-watched opening night ever',sourceDate},'Tuesday’s 76ers-Knicks and Thunder-Spurs doubleheader was the NBA’s most-watched opening night ever, averaging 6.41 million viewers on NBC/Peacock.',old,undefined,true)!;
 const en={title:'NBA reports an opening-night audience',summary:'NBA Communications reports the audience of its opening doubleheader.',body:'NBA Communications reports that the NBC and Peacock doubleheader averaged 6.41 million viewers: Philadelphia 76ers vs New York Knicks; Oklahoma City Thunder vs San Antonio Spurs.'};
 const evidence:ReviewEvidence={model:'synthetic',rubric:'announcement-brief-v3',facts,draft:{en},deterministic:[validatorCorrection.diagnostic],audit:null,status:validatorCorrection.failure,usage:{calls:1,inputTokens:100,outputTokens:20,microUsd:20,stages:{original:{inputTokens:100,outputTokens:20,microUsd:20}}},correctedFields:[]};
 const repo=new AutomationRepository(db),checks:string[]=[];
 async function seed(){
  await db.query('TRUNCATE editorial_generation_evidence,editorial_automation_audit,editorial_automation_events,editorial_automation_runs,editorial_news_audit,editorial_news RESTART IDENTITY CASCADE');
  await repo.control({paused:false});
  await db.query("UPDATE editorial_discovery_state SET disabled=false,failures=0,last_attempt_at=$1,last_success_at=$1,next_allowed_at=$2,cursor='{}' WHERE source_id='nba-releases'",[old.toISOString(),new Date(+now+5*3600000).toISOString()]);
  const original=randomUUID();
  await db.query("INSERT INTO editorial_automation_runs(id,started_at,finished_at,lease_until,status,model_microusd_reserved,model_microusd_used,result) VALUES($1,$2,$2,$2,'completed',20000,20,$3)",[original,old.toISOString(),JSON.stringify({generation:validatorCorrection.failure})]);
  await db.query("INSERT INTO editorial_automation_events(event_key,source_id,source_url,fingerprint,facts,state,reason,revision,attempts,discovered_at,changed_at) VALUES($1,'nba-releases',$2,$3,$4,'review',$5,2,1,$6,$6)",[facts.eventKey,facts.sourceUrl,fingerprint(stableFacts(facts)),JSON.stringify(facts),validatorCorrection.failure,old.toISOString()]);
  await repo.saveEvidence(original,facts.eventKey,1,evidence);
  const claim=await repo.claim(true,false,now);assert.ok('id' in claim);return {id:claim.id,original};
 }
 const fresh={...facts,observedAt:now.toISOString()};
 try{
  for(const f of ['072_v2_editorial_newsroom.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql'])await db.query(await readFile('db/migrations/'+f,'utf8'));
  await repo.initialize(now);
  let run=await seed();
  assert.equal((await repo.dueSources(now)).some(s=>s.sourceId==='nba-releases'),false);
  const grants=await Promise.all([repo.beginValidatorRecovery(run.id,now),repo.beginValidatorRecovery(run.id,now)]);assert.equal(grants.filter(Boolean).length,1);let grant=grants.find(Boolean)!;
  const reconnect=new PostgresDatabaseClient(uri.href);try{assert.equal(await new AutomationRepository(reconnect).beginValidatorRecovery(run.id,now),null);}finally{await reconnect.close();}
  assert.equal(await repo.observe(run.id,fresh,now),'unchanged');
  assert.equal((await db.query('SELECT state FROM editorial_automation_events')).rows[0].state,'review');
  assert.equal(await repo.finishValidatorRecovery(run.id,grant.ticket,fresh,now),true);
  assert.equal(await repo.finishValidatorRecovery(run.id,grant.ticket,fresh,now),false);
  let event=await repo.eligiblePending(now,false);assert.ok(event);assert.equal(event.attempts,1);assert.equal(event.revision,2);
  assert.equal((await db.query('SELECT payload FROM editorial_generation_evidence')).rows[0].payload.status,validatorCorrection.failure);
  assert.equal((await repo.dashboard()).validatorRecovery.length,2);
  checks.push('exact retained deterministic defect rechecks a healthy source once; concurrent/restarted claims cannot repeat it; unchanged observations alone do not recover review events');
  await repo.markAttempt(run.id,event.eventKey);await assert.rejects(repo.markAttempt(run.id,event.eventKey),/RECOVERY_NOT_PENDING|RECOVERY_ALREADY_ATTEMPTED|STORY_ALREADY_ATTEMPTED/);
  assert.equal(await repo.eligiblePending(now,false),null,'crash after claim cannot repeat paid work');
  await repo.fail(event.eventKey,'MODEL_UNAVAILABLE');
  assert.equal((await db.query('SELECT state,attempts FROM editorial_automation_events')).rows[0].state,'review');
  assert.equal((await db.query('SELECT attempts FROM editorial_automation_events')).rows[0].attempts,2);
  assert.equal(await repo.beginValidatorRecovery(run.id,now),null);assert.equal(await repo.pending(),null);
  checks.push('one recovery attempt preserves original attempt and failure; crash or retryable model failure cannot create another recovery attempt');
  for(const mutation of[
   "UPDATE editorial_automation_events SET reason='EDITORIAL_REVIEW_REQUIRED'",
   "UPDATE editorial_generation_evidence SET payload=jsonb_set(payload,'{audit}','{\"grounded\":false,\"translations\":true,\"original\":true,\"quality\":true,\"issues\":[]}'::jsonb)",
   "UPDATE editorial_generation_evidence SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day'",
   "UPDATE editorial_generation_evidence SET payload=jsonb_set(payload,'{validatorVersion}','\"nba-audience-average-inflections-v1\"'::jsonb)",
   "UPDATE editorial_discovery_state SET failures=1 WHERE source_id='nba-releases'",
   "UPDATE editorial_discovery_state SET disabled=true WHERE source_id='nba-releases'",
   "UPDATE editorial_automation_runs SET model_microusd_reserved=0 WHERE status='running'"
  ]){run=await seed();await db.query(mutation);assert.equal(await repo.beginValidatorRecovery(run.id,now),null,mutation);}
  checks.push('independent audit rejection, wrong failure/version, expired evidence, source backoff/disable and missing reservation are never recoverable');
  run=await seed();await db.query("INSERT INTO editorial_news(slug,draft,archived) VALUES('protected',$1,true)",[JSON.stringify({sourceUrl:facts.sourceUrl})]);assert.equal(await repo.beginValidatorRecovery(run.id,now),null);
  run=await seed();grant=(await repo.beginValidatorRecovery(run.id,now))!;await db.query("INSERT INTO editorial_news(slug,draft,archived) VALUES('protected',$1,true)",[JSON.stringify({sourceUrl:facts.sourceUrl})]);assert.equal(await repo.finishValidatorRecovery(run.id,grant.ticket,fresh,now),false);
  assert.equal((await db.query("SELECT archived FROM editorial_news WHERE slug='protected'")).rows[0].archived,true);
  checks.push('protected Owner records and archives block both the pre-poll and post-poll race, without edits or publication');
  for(const variant of ['missing','old-observation','identity','source-failure','changed-event'] as const){
   run=await seed();grant=(await repo.beginValidatorRecovery(run.id,now))!;
   if(variant==='source-failure')await db.query("UPDATE editorial_discovery_state SET failures=1 WHERE source_id='nba-releases'");
   if(variant==='changed-event')await db.query('UPDATE editorial_automation_events SET revision=revision+1');
   const input=variant==='missing'?undefined:variant==='old-observation'?facts:variant==='identity'?{...fresh,eventKey:'different'}:fresh;
   assert.equal(await repo.finishValidatorRecovery(run.id,grant.ticket,input,now),false);
   assert.equal((await db.query('SELECT state FROM editorial_automation_events')).rows[0].state,'review');
  }
  checks.push('missing, stale, changed identity, failed primary source and changed event evidence remain private; no inference from a 304 or inaccessible source');
  run=await seed();grant=(await repo.beginValidatorRecovery(run.id,now))!;await repo.control({paused:true});await assert.rejects(repo.finishValidatorRecovery(run.id,grant.ticket,fresh,now),/AUTOMATION_STOPPED/);
  checks.push('emergency pause aborts recovery before generation');
  run=await seed();grant=(await repo.beginValidatorRecovery(run.id,now))!;assert.equal(await repo.finishValidatorRecovery(run.id,grant.ticket,fresh,now),true);event=(await repo.eligiblePending(now,false))!;await repo.markAttempt(run.id,event.eventKey);
  const text:GeneratedCopy={en,es:{title:'La NBA informa de su audiencia inaugural',summary:'NBA Communications informa de la audiencia de su doble jornada inaugural.',body:'Según NBA Communications, la doble jornada de NBC y Peacock registró un promedio de 6,41 millones de espectadores: Philadelphia 76ers contra New York Knicks; Oklahoma City Thunder contra San Antonio Spurs.'},pt:{title:'NBA informa a audiência da rodada de abertura',summary:'NBA Communications informa a audiência da rodada dupla de abertura.',body:'Segundo NBA Communications, a rodada dupla na NBC e Peacock registrou uma média de 6,41 milhões de espectadores: Philadelphia 76ers contra New York Knicks; Oklahoma City Thunder contra San Antonio Spurs.'}};
  // Synthetic approved copy verifies storage gates only; never claims a real model audit.
  const slug=await repo.publish(run.id,event,toNewsDraft(text,fresh,now),now);assert.ok(slug);
  await assert.rejects(repo.publish(run.id,event,toNewsDraft(text,fresh,now),now),/PUBLICATION_CONFLICT/);
  assert.equal((await db.query('SELECT count(*) FROM editorial_news WHERE published IS NOT NULL')).rows[0].count,'1');
  assert.equal((await db.query('SELECT attempts FROM editorial_automation_events')).rows[0].attempts,2);
  assert.equal((await db.query("SELECT count(*) FROM editorial_automation_audit WHERE action='auto-publish'")).rows[0].count,'1');
  checks.push('recovered event uses normal atomic publisher and duplicate protection, while original rejection evidence remains intact');
  await repo.finish(run.id,{generation:'synthetic-acceptance'},{calls:0,inputTokens:0,outputTokens:0,microUsd:0});
  assert.deepEqual(await repo.claim(true,false,now),{reason:'not-due'});
  await db.query("INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,model_microusd_reserved) SELECT gen_random_uuid(),$1,$1,'completed',20000 FROM generate_series(1,150)",[now.toISOString().slice(0,7)+'-01T00:00:00Z']);
  const tomorrow=new Date(+now+86400000);if(tomorrow.getUTCMonth()===now.getUTCMonth())assert.deepEqual(await repo.claim(true,false,tomorrow),{reason:'model-budget'});
  checks.push('normal due slot and monthly budget gate remain mandatory before any recovery source/model work');
  return checks;
 }finally{await db.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);}
}
