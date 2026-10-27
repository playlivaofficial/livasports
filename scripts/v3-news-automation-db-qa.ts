/** Synthetic isolated PostgreSQL acceptance. Never accepts a remote database host. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
import {resultsFromSnapshot,toNewsDraft,type GeneratedCopy} from '../src/editorial/automation/policy';
import {normalizeOpenLigaSnapshot} from '../src/multisport/openligadb';
import {snapshotHash} from '../src/multisport/repository';
import {extractAnnouncement} from '../src/editorial/automation/announcements';
import {candidateDraft} from '../src/editorial/discovery';
import {runNewsAutomation} from '../src/editorial/automation/runner';
import {canaryAcceptance} from './v36-canary-db-acceptance';
import {invocationAcceptance} from './v37-invocation-db-acceptance';

async function main(){
 const url=new URL(process.env.V3_QA_DATABASE_URL??'');
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/livasports_v3_qa');assert.ok(['5432','55475'].includes(url.port));
 const admin=new PostgresDatabaseClient(url.href),schema='qa_news_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);
 const db=new PostgresDatabaseClient(url.href),now=new Date();
 const checks:string[]=[];
 try{
  for(const file of ['072_v2_editorial_newsroom.sql','073_v3_sports_snapshots.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql'])await db.query(await readFile('db/migrations/'+file,'utf8'));
  const migration=await readFile('db/migrations/074_v3_news_automation.sql','utf8');
  await db.query("INSERT INTO editorial_news(slug,draft) VALUES('preserved-owner-draft','{}')");
  await db.query(migration);await db.query(migration);
  assert.equal((await db.query('SELECT count(*) FROM editorial_news')).rows[0].count,'1');checks.push('074 repeatability and existing record preservation');
  const repo=new AutomationRepository(db);await repo.initialize(now);assert.deepEqual(await repo.claim(true,true,now),{reason:'paused'});checks.push('default paused');
  assert.equal((await repo.dueSources(now)).length,2);checks.push('newly registered sources are due in the first cycle, without a six-hour bootstrap delay');
  await repo.control({paused:false});
  const competing=await Promise.all([repo.claim(true,true,now),repo.claim(true,true,now)]),claimed=competing.filter(x=>'id' in x);assert.equal(claimed.length,1);checks.push('concurrent run exclusion');
  const run=claimed[0] as {id:string};
  assert.equal((await repo.dashboard()).usage.lifetimeReservedMicroUsd,20000);checks.push('durable pre-call budget reservation');
  // A new physical pool, not just a new repository around the same connection.
  const reconnected=new PostgresDatabaseClient(url.href);
  try{
   const restarted=new AutomationRepository(reconnected);
   assert.deepEqual(await restarted.claim(true,true,now),{reason:'not-due'});
   assert.equal((await restarted.dashboard()).usage.lifetimeReservedMicroUsd,20000);
   await restarted.assertActive(run.id);
   checks.push('independent database reconnect preserves active lease, due time and atomic reservation');
  }finally{await reconnected.close();}
  const yesterday=new Date(+now-86400000).toISOString(),nextWeek=new Date(+now+7*86400000).toISOString();
  const ids=[1,...Array.from({length:16},(_,i)=>i+3),2];
  const table=ids.map(id=>({teamInfoId:id,teamName:`Synthetic Club ${id}`,matches:id<=2?1:0,won:id===1?1:0,draw:0,lost:id===2?1:0,goals:id===1?1:0,opponentGoals:id===2?1:0,goalDiff:id===1?1:id===2?-1:0,points:id===1?3:0}));
  const matches=Array.from({length:18},(_,i)=>i+1).flatMap(home=>Array.from({length:18},(_,i)=>i+1).filter(away=>away!==home).map(away=>({matchID:home*100+away,matchDateTimeUTC:home===1&&away===2?yesterday:nextWeek,team1:{teamId:home,teamName:`Synthetic Club ${home}`},team2:{teamId:away,teamName:`Synthetic Club ${away}`},matchIsFinished:home===1&&away===2,matchResults:home===1&&away===2?[{resultTypeID:2,pointsTeam1:1,pointsTeam2:0}]:[],group:{groupName:'Synthetic round'}})));
  const snapshot=normalizeOpenLigaSnapshot(table,matches,now),facts=resultsFromSnapshot(snapshot,now)[0];assert.ok(facts);
  await db.query('INSERT INTO sports_snapshots(snapshot_key,competition_id,season,draft,published,content_hash) VALUES($1,$2,$3,$4,$4,$5)',[`bundesliga:${snapshot.season}`,'bundesliga',snapshot.season,JSON.stringify(snapshot),snapshotHash(snapshot)]);
  assert.equal(await repo.observe(run.id,facts,now),'new');assert.equal(await repo.observe(run.id,facts,now),'unchanged');checks.push('durable event deduplication');
  const text:GeneratedCopy={en:{title:'Synthetic Club 1 records a victory',summary:'Synthetic Club 1 has a recorded win over Synthetic Club 2.',body:'OpenLigaDB records Synthetic Club 1 against Synthetic Club 2 at 1–0. The recorded result places Synthetic Club 1 on the winning side.'},es:{title:'Victoria de Synthetic Club 1 registrada',summary:'Synthetic Club 1 registra una victoria sobre Synthetic Club 2.',body:'OpenLigaDB registra a Synthetic Club 1 frente a Synthetic Club 2 con 1–0. El resultado registrado corresponde a una victoria de Synthetic Club 1.'},pt:{title:'Vitória registrada de Synthetic Club 1',summary:'Synthetic Club 1 registra uma vitória sobre Synthetic Club 2.',body:'OpenLigaDB registra Synthetic Club 1 contra Synthetic Club 2 com 1–0. O resultado registrado corresponde a uma vitória de Synthetic Club 1.'}};
  const event=await repo.pending();assert.ok(event);await repo.markAttempt(run.id,event.eventKey);
  const protectedDraft=toNewsDraft(text,facts,now);
  await db.query('INSERT INTO editorial_news(slug,draft,archived) VALUES($1,$2,true)',['synthetic-owner-archive',JSON.stringify(protectedDraft)]);
  assert.equal(await repo.publicationBlocker(event),'OWNER_OR_DUPLICATE_RECORD');
  await assert.rejects(repo.publish(run.id,event,protectedDraft,now),/OWNER_OR_DUPLICATE_RECORD/);
  assert.equal((await db.query("SELECT archived FROM editorial_news WHERE slug='synthetic-owner-archive'")).rows[0].archived,true);
  await db.query("DELETE FROM editorial_news WHERE slug='synthetic-owner-archive'");
  checks.push('archived Owner source blocks pre-generation and atomic publication; archive remains unchanged');
  const privateMigration=await readFile('db/migrations/075_v3_news_review_evidence.sql','utf8');await db.query(privateMigration);await db.query(privateMigration);checks.push('075 additive migration repeatability');
  await repo.saveEvidence(run.id,event.eventKey,0,{model:'synthetic',rubric:'test',facts,draft:text,deterministic:[],audit:{grounded:false,translations:true,original:true,quality:true,issues:[{field:'en.body',code:'UNSUPPORTED_FACT',reason:'Synthetic rejection'}]},status:'EDITORIAL_REVIEW_REQUIRED',usage:{calls:0,inputTokens:0,outputTokens:0,microUsd:0},correctedFields:[]});
  assert.equal((await repo.reviewEvidence()).length,1);assert.equal((await db.query('SELECT count(*) FROM editorial_news WHERE published IS NOT NULL')).rows[0].count,'0');checks.push('rejected draft retained privately without public publication');
  await db.query("UPDATE editorial_generation_evidence SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day'");assert.deepEqual(await repo.reviewEvidence(),[]);assert.equal((await db.query('SELECT count(*) FROM editorial_generation_evidence')).rows[0].count,'0');checks.push('expired private evidence automatically deleted, no public data touched');
  const slug=await repo.publish(run.id,event,toNewsDraft(text,facts,now),now);
  assert.equal((await db.query('SELECT archived FROM editorial_news WHERE slug=$1',[slug])).rows[0].archived,false);checks.push('atomic policy publication with audit');
  await assert.rejects(repo.publish(run.id,event,toNewsDraft(text,facts,now),now),/PUBLICATION_CONFLICT/);checks.push('no double publication');
  const changed={...facts,homeScore:2};assert.equal(await repo.observe(run.id,changed,now),'changed');
  const old=(await db.query('SELECT archived,published FROM editorial_news WHERE slug=$1',[slug])).rows[0];assert.equal(old.archived,true);assert.ok(old.published);checks.push('source correction withdraws public claim and preserves historical copy');
  assert.equal((await repo.dashboard()).events[0].state,'review');checks.push('correction quarantined, no silent rewrite');
  const candidate={desk:'nba-releases',url:'https://pr.nba.com/synthetic-roster-announcement',headline:'NBA rosters feature 125 international players from record-tying 43 countries across six continents',sourceDate:yesterday.slice(0,10)};
  const announcement=extractAnnouncement(candidate,'125 international players from a record-tying 43 countries across six continents are on opening-night rosters for the 2026-27 season.',now)!;
  const placeholder=candidateDraft(candidate);
  await db.query('INSERT INTO editorial_news(slug,draft) VALUES($1,$2)',[placeholder.slug,JSON.stringify(placeholder)]);
  await repo.observe(run.id,{kind:'metadata',candidate},now);await repo.observe(run.id,announcement,now);
  const announced=await repo.pending();assert.ok(announced);assert.equal(announced.facts.kind,'announcement');
  await repo.markAttempt(run.id,announced.eventKey);
  const announcementCopy:GeneratedCopy={en:{title:'NBA announces international roster totals',summary:'The NBA reports international representation on opening rosters.',body:'NBA Communications reports 125 international players from 43 countries across six continents on opening-night rosters.'},es:{title:'La NBA anuncia cifras internacionales',summary:'La NBA informa sobre la representación internacional en sus plantillas.',body:'NBA Communications informa de 125 jugadores internacionales de 43 países y seis continentes en las plantillas iniciales.'},pt:{title:'NBA anuncia números internacionais',summary:'A NBA informa sobre a representação internacional nos elencos.',body:'NBA Communications informa que os elencos de abertura incluem 125 jogadores internacionais de 43 países e seis continentes.'}};
  const announcementSlug=await repo.publish(run.id,announced,toNewsDraft(announcementCopy,announcement,now),now);
  assert.equal((await db.query('SELECT published FROM editorial_news WHERE slug=$1',[placeholder.slug])).rows[0].published,null);
  assert.equal(await repo.observe(run.id,announcement,now),'unchanged');
  await assert.rejects(repo.publish(run.id,announced,toNewsDraft(announcementCopy,announcement,now),now),/PUBLICATION_CONFLICT/);
  checks.push('announcement JSONB round-trip publication, metadata promotion, duplicate protection and pristine private placeholder preservation');
  const corrected={...announcement,detail:{...announcement.detail,type:'roster-announcement' as const,season:'2026-27',scope:'opening-night' as const,internationalPlayers:126,countries:43,continents:6}};
  await repo.observe(run.id,corrected,now);assert.equal((await db.query('SELECT archived FROM editorial_news WHERE slug=$1',[announcementSlug])).rows[0].archived,true);
  checks.push('changed announcement withdraws public version and quarantines unverified correction');
  const metadata={kind:'metadata' as const,candidate:{desk:'nhl',url:'https://www.nhl.com/news/synthetic-ambiguous-item',headline:'Synthetic ambiguous report requiring editorial review',sourceDate:now.toISOString().slice(0,10)}};
  assert.equal(await repo.sourceEnabled('nhl'),false);const due=await repo.dueSources();assert.equal(due.some(s=>s.sourceId==='nhl'),false);assert.equal(due.length,2);assert.deepEqual(due.map(s=>s.sourceId),['dimayor-releases','nba-releases']);checks.push('primary RSS desks scheduled independently and bounded to two; unverified HTML source remains disabled');
  const rss={kind:'metadata' as const,candidate:{desk:'nba-releases',url:'https://pr.nba.com/synthetic-official-announcement',headline:'NBA synthetic official announcement',sourceDate:now.toISOString().slice(0,10)}};
  assert.equal(await repo.observe(run.id,rss,now),'new');assert.equal(await repo.observe(run.id,rss,now),'unchanged');
  const rssEvent=(await repo.dashboard()).events.find(e=>e.facts.kind==='metadata'&&e.facts.candidate.desk==='nba-releases')!;
  assert.equal(rssEvent.state,'review');assert.equal(rssEvent.newsSlug,null);assert.equal(rssEvent.reason,'SOURCE_RIGHTS_AND_FACT_REVIEW');checks.push('primary RSS private intake persists and deduplicates; no fact or publication approval inferred');
  await repo.finishSource(run.id,due[0].sourceId,'NO_CURRENT_VERIFIED_CANDIDATES',1,{},now);
  const cooled=(await repo.dashboard()).sources.find(s=>s.sourceId===due[0].sourceId)!;assert.equal(cooled.failures,0);assert.equal(Date.parse(cooled.nextAllowedAt),+now+86400000);assert.equal((await repo.dueSources()).some(s=>s.sourceId===due[0].sourceId),false);checks.push('empty licensed discovery gets successful cooldown and advances source rotation');
  await repo.finishSource(run.id,'wikinews-football','NO_CURRENT_VERIFIED_CANDIDATES',1,{},now);
  const supplement=(await repo.dashboard()).sources.find(s=>s.sourceId==='wikinews-football')!;assert.equal(Date.parse(supplement.nextAllowedAt),+now+7*86400000);checks.push('empty supplementary Wikinews backs off one week without replacing daily primary intake');
  // Synthetic private imported citation, not authorization to make a source request.
  await db.query("UPDATE editorial_discovery_state SET disabled=false WHERE source_id='nhl'");
  await repo.observe(run.id,metadata,now);assert.equal((await repo.dashboard()).events.find(e=>e.facts.kind==='metadata')?.state,'review');checks.push('ambiguous source never auto-published');
  await db.query("UPDATE editorial_automation_events SET state='pending',attempts=0,news_slug=NULL,publication_revision=NULL WHERE event_key=$1",[event.eventKey]);
  await repo.markAttempt(run.id,event.eventKey);await repo.fail(event.eventKey,'MODEL_UNAVAILABLE');assert.equal(await repo.pending(),null);
  await db.query("UPDATE editorial_automation_events SET changed_at=now()-interval '7 hours' WHERE event_key=$1",[event.eventKey]);assert.equal((await repo.pending())?.eventKey,event.eventKey);
  await repo.markAttempt(run.id,event.eventKey);await repo.fail(event.eventKey,'MODEL_UNAVAILABLE');
  await db.query("UPDATE editorial_automation_events SET changed_at=now()-interval '7 hours' WHERE event_key=$1",[event.eventKey]);assert.equal(await repo.pending(),null);
  await db.query("UPDATE editorial_automation_events SET changed_at=now()-interval '13 hours' WHERE event_key=$1",[event.eventKey]);assert.equal((await repo.pending())?.eventKey,event.eventKey);
  await repo.markAttempt(run.id,event.eventKey);await repo.fail(event.eventKey,'MODEL_UNAVAILABLE');assert.equal(await repo.pending(),null);checks.push('durable six/twelve-hour backoff and maximum three attempts');
  await repo.fail(event.eventKey,'MODEL_AUTH_REJECTED');assert.equal((await repo.dashboard()).paused,true);checks.push('authentication failure opens global model circuit breaker');
  for(const reason of ['MODEL_QUOTA_EXCEEDED','MODEL_LIMIT_UNCLASSIFIED']){await repo.control({paused:false});await repo.fail(event.eventKey,reason);assert.equal((await repo.dashboard()).paused,true);assert.equal(await repo.pending(),null);}checks.push('quota and ambiguous 429 failures stop all subsequent model calls');
  await repo.control({paused:false});
  await repo.control({paused:true});await assert.rejects(repo.assertActive(run.id),/AUTOMATION_STOPPED/);checks.push('emergency pause stops active job publication');
  await repo.finish(run.id,{synthetic:true},{calls:0,inputTokens:0,outputTokens:0,microUsd:0});assert.equal((await repo.dashboard()).usage.lifetimeReservedMicroUsd,20000);checks.push('unknown/failed usage reservation is not refunded');
  await repo.control({paused:false});
  // Isolated clock simulation, NOT a claim of observing a second real day.
  await db.query("UPDATE editorial_discovery_state SET disabled=true WHERE source_id NOT IN ('dimayor-releases','nba-releases')");
  let syntheticRequests=0;
  const emptyFeed:typeof fetch=async input=>{
    syntheticRequests++;
    assert.match(String(input),/^https:\/\/(?:pr\.nba\.com|dimayor\.com\.co)\/(?:robots\.txt|feed\/)$/);
    return new Response(String(input).endsWith('robots.txt')?'User-agent: *\nAllow: /':'<rss><channel></channel></rss>');
  };
  const cycles=[];
  for(const hours of [7,25,49]){
    const clock=new Date(+now+hours*3600000);
    // New repository object simulates a worker restart against the SAME durable tables.
    const worker=new AutomationRepository(db);
    const cycle=await runNewsAutomation(worker,{validationOnly:true,fetcher:emptyFeed,now:clock});
    assert.equal(cycle.status,'completed');assert.deepEqual(cycle.published,[]);
    assert.equal((await runNewsAutomation(new AutomationRepository(db),{validationOnly:true,fetcher:emptyFeed,now:clock})).status,'not-due');
    cycles.push(cycle);
  }
  assert.ok(syntheticRequests>0);assert.ok(cycles.every(c=>c.requests<=4));
  assert.equal((await repo.dashboard()).usage.lifetimeReservedMicroUsd,20000);
  checks.push('three accelerated scheduler cycles across worker reconstruction: empty RSS, durable cadence deduplication, bounded discovery, no model calls');
  await repo.control({paused:true});
  const beforePaused=syntheticRequests;
  assert.equal((await runNewsAutomation(new AutomationRepository(db),{validationOnly:true,fetcher:emptyFeed,now:new Date(+now+73*3600000)})).status,'paused');
  assert.equal(syntheticRequests,beforePaused);checks.push('scheduled pause prevents even source requests after worker reconstruction');
  await repo.control({paused:false});
  await db.query("UPDATE editorial_automation_runs SET started_at=now()-interval '2 days'");
  for(let i=0;i<49;i++)await db.query("INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,model_microusd_reserved) VALUES($1,now()-interval '2 days',now()-interval '2 days','abandoned',20000)",[randomUUID()]);
  assert.deepEqual(await repo.claim(true,true,now),{reason:'model-budget'});checks.push('$1 lifetime validation hard stop including abandoned calls');
  await db.query('BEGIN');await db.query("UPDATE editorial_automation_control SET paused=true");await db.query('ROLLBACK');assert.equal((await repo.dashboard()).paused,false);checks.push('transaction rollback preserves control state');
  checks.push(...await canaryAcceptance(admin,url));
  checks.push(...await invocationAcceptance(admin,url));
  const indexes=(await db.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename LIKE 'editorial_%' ORDER BY indexname")).rows.map(x=>x.indexname);
  const evidence={at:now.toISOString(),environment:'isolated PostgreSQL synthetic schema',migration:'074',applications:3,checks,indexes,realSourceCalls:0,realModelCalls:0,productionConnections:0,syntheticPublications:2,schemaPreservedForInspection:schema};
  await mkdir('output/v3-qa/acceptance-2026-10-21',{recursive:true});await writeFile('output/v3-qa/acceptance-2026-10-21/automation-db.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await db.close();await admin.close();}
}
main().catch(error=>{const raw=String(error?.message??'unknown').replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]');console.error('Isolated automation acceptance failed: '+raw);process.exitCode=1;});
