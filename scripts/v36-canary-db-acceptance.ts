/** Synthetic transaction tests only; invoked by the existing isolated PostgreSQL gate. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
import {fingerprint,stableFacts,type ResultFacts} from '../src/editorial/automation/policy';
export async function canaryAcceptance(admin:PostgresDatabaseClient,input:URL){
 assert.ok(['127.0.0.1','localhost'].includes(input.hostname));
 const schema='qa_canary_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const uri=new URL(input);uri.searchParams.set('options',`-c search_path=${schema}`);const db=new PostgresDatabaseClient(uri.href),checks:string[]=[];
 try{
 for(const file of ['072_v2_editorial_newsroom.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql'])await db.query(await readFile('db/migrations/'+file,'utf8'));
 const now=new Date(),yesterday=new Date(+now-86400000).toISOString();
 const facts:ResultFacts={kind:'result',sourceId:'openliga-results',sourceUrl:'https://api.openligadb.de/getmatchdata/123',competition:'bundesliga',season:'2026/27',eventId:'openligadb-match-123',eventKey:'bundesliga:2026/27:openligadb-match-123',observedAt:now.toISOString(),eventDate:yesterday,home:{id:'home',name:'Synthetic Home'},away:{id:'away',name:'Synthetic Away'},homeScore:1,awayScore:3,status:'completed',sourceSnapshotHash:'synthetic'};
 const scope={id:'synthetic-one-use',sourceId:'openliga-results',eventKey:facts.eventKey,fingerprint:fingerprint(stableFacts(facts)),notBefore:now.toISOString(),expiresAt:new Date(+now+3600000).toISOString(),priorReservedMicroUsd:180000};
 const repo=new AutomationRepository(db,scope);await repo.initialize(now);
 assert.deepEqual(await repo.claim(true,true,now),{reason:'paused'});await repo.control({paused:false});
 assert.equal((await repo.dashboard()).sources.length,1);assert.equal(await repo.sourceEnabled('nfl-cardinals'),false);assert.deepEqual(await repo.dueSources(now),[]);
 checks.push('canary only initializes and permits its approved source');
 const expired=new AutomationRepository(db,{...scope,expiresAt:yesterday});assert.deepEqual(await expired.claim(true,true,now),{reason:'canary-expired'});assert.deepEqual(await repo.claim(false,true,now),{reason:'canary-model-disabled'});
 assert.deepEqual(await new AutomationRepository(db,{...scope,notBefore:new Date(+now+60000).toISOString()}).claim(true,true,now),{reason:'canary-not-due'});
 assert.equal((await db.query('SELECT count(*) FROM editorial_automation_runs')).rows[0].count,'0');checks.push('expired grant and disabled model consume no reservation');
 assert.deepEqual(await new AutomationRepository(db,{...scope,priorReservedMicroUsd:990000}).claim(true,true,now),{reason:'model-budget'});checks.push('prior external validation reservations reduce the lifetime ceiling without fabricating transactions');
 const race=await Promise.all([repo.claim(true,true,now),repo.claim(true,true,now)]);assert.equal(race.filter(r=>'id' in r).length,1);assert.equal(race.filter(r=>'reason' in r&&r.reason==='canary-consumed').length,1);
 const run=race.find(r=>'id' in r) as {id:string};assert.ok(run);assert.equal((await repo.dashboard()).usage.lifetimeReservedMicroUsd,20000);checks.push('atomic one-use grant with concurrent exclusion and durable $0.02 reservation');
 const reconnect=new PostgresDatabaseClient(uri.href);try{assert.deepEqual(await new AutomationRepository(reconnect,scope).claim(true,true,now),{reason:'canary-consumed'});}finally{await reconnect.close();}
 checks.push('consumed grant survives physical reconnect');
 assert.equal(await repo.observe(run.id,{...facts,eventKey:'bundesliga:other'},now),'unchanged');
 assert.equal(await repo.observe(run.id,{...facts,awayScore:4},now),'unchanged');
 assert.equal((await db.query('SELECT count(*) FROM editorial_automation_events')).rows[0].count,'0');
 assert.equal(await repo.observe(run.id,facts,now),'new');assert.equal((await repo.eligiblePending(now))?.eventKey,facts.eventKey);
 assert.equal(await repo.reconcile(run.id,new Set(),now),0);checks.push('only exact preflight facts enter queue; no unrelated reconciliation or withdrawal');
 await db.query("INSERT INTO editorial_news(slug,draft,archived) VALUES('synthetic-owner-archive',$1,true)",[JSON.stringify({sourceUrl:facts.sourceUrl})]);
 assert.equal(await repo.publicationBlocker((await repo.eligiblePending(now))!),'OWNER_OR_DUPLICATE_RECORD');checks.push('protected Owner archive blocks canary before generation');
 await repo.markAttempt(run.id,facts.eventKey);assert.equal(await repo.eligiblePending(now),null);checks.push('one-event canary never retries an attempted event');
 await db.query("UPDATE editorial_automation_runs SET result=jsonb_set(result,'{canary,expiresAt}',to_jsonb($2::text)) WHERE id=$1",[run.id,yesterday]);
 await assert.rejects(repo.assertActive(run.id),/AUTOMATION_STOPPED_OR_LEASE_LOST/);checks.push('expired grant stops additional calls on an existing lease');
 await repo.finish(run.id,{status:'failed'},{calls:0,inputTokens:0,outputTokens:0,microUsd:0},'failed');
 assert.equal((await db.query('SELECT result FROM editorial_automation_runs WHERE id=$1',[run.id])).rows[0].result.canary.id,scope.id);
 await repo.control({paused:true});assert.equal((await repo.dashboard()).paused,true);await repo.control({paused:false});
 assert.deepEqual(await new AutomationRepository(db,{...scope,id:'another-id-same-event'}).claim(true,true,now),{reason:'canary-consumed'});checks.push('completed scope retained; renaming grant cannot retry the same event');
 const other={...scope,id:'synthetic-other',eventKey:'bundesliga:other'};
 assert.deepEqual(await new AutomationRepository(db,other).claim(true,true,now),{reason:'not-due'});checks.push('new scope cannot bypass six-hour cadence');
 await repo.control({paused:true});
 return checks;
 }finally{await db.close();}
}
