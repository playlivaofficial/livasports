/** One authorized real-clock LOCAL scheduler invocation. No scheduling override or Production URL. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
import {factErrors} from '../src/editorial/automation/policy';
assert.equal(process.argv[2],'--one-authorized-local-run');
assert.ok(Date.now()>=Date.parse('2026-10-26T12:57:40.139Z'),'AUTHORIZED_TIME_NOT_REACHED');
const sql=(input:string)=>{const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,'ISOLATED_SQL_FAILED');return r.stdout.trim();};
const backup=()=>assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0,'BACKUP_FAILED');
assert.equal(sql('SELECT current_database()'),'livasports_v3_qa');
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
assert.equal(sql('SELECT historical_reserved_microusd FROM local_validation_epoch'),'80000');
assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname='local_validation_budget' AND tgenabled='O'"),'1');
assert.equal(sql("SELECT count(*) FROM editorial_automation_audit WHERE action='v35-nfl-honor-authorized-pilot'"),'0','AUTHORIZATION_ALREADY_CONSUMED');
assert.equal(sql("SELECT count(*) FROM editorial_automation_runs WHERE started_at>now()-interval '6 hours' OR(status='running' AND lease_until>now())"),'0','NOT_DUE');
const preflight=JSON.parse(await readFile('output/v3-qa/v35/newsroom/nfl-preflight.json','utf8'));
assert.ok(Date.now()-Date.parse(preflight.at)<10*60000,'FRESH_PREFLIGHT_REQUIRED');
assert.equal(preflight.status,'NEW_FACTS_VERIFIED_NOT_GENERATED');assert.deepEqual(factErrors(preflight.facts),[]);
assert.equal(preflight.facts.detail.recipient,'Larry Fitzgerald');assert.equal(preflight.facts.detail.type,'team-honor');
assert.equal(preflight.existingOwnerRecordsIncludingArchived,0);assert.equal(preflight.existingAutomationEvents,0);
const reserved=Number(sql('SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) FROM editorial_automation_runs'));assert.ok(reserved+80000+20000<=1000000,'VALIDATION_BUDGET');
const privateEnv=await readFile('.env.local','utf8'),key=privateEnv.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');assert.ok(key,'LOCAL_KEY_MISSING');
const archives=()=>sql("SELECT coalesce(md5(string_agg(row_to_json(n)::text,'' ORDER BY slug)),'empty') FROM editorial_news n WHERE archived");
const beforeArchives=archives();backup();
const role='livasports_v35_nfl_pilot',password=randomBytes(32).toString('base64url');assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`),'0');
sql(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now()+3600000).toISOString()}'; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON editorial_automation_control,editorial_automation_runs,editorial_automation_events,editorial_automation_audit,editorial_discovery_state,editorial_news,editorial_news_audit,editorial_generation_evidence,request_rate_limits TO ${role}; GRANT SELECT ON sports_snapshots,local_validation_epoch TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};`);
const uri=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');uri.username=role;uri.password=password;
const db=new PostgresDatabaseClient(uri.href,undefined,{statementTimeoutMs:5000}),repo=new AutomationRepository(db);
const report:Record<string,unknown>={at:new Date().toISOString(),localOnly:true,clock:'real; normal authenticated scheduler HTTP route',productionChanges:0};
const cron=randomBytes(48).toString('base64url');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz'].includes(k.toLowerCase())));
Object.assign(env,{DATABASE_URL:uri.href,CRON_SECRET:cron,OPENAI_API_KEY:key,V3_NEWS_AUTOMATION_ENABLED:'true',V3_NEWS_MODEL_ENABLED:'true',V3_NEWS_BUDGET_MODE:'validation',V3_OPENLIGA_AUTOMATION_ENABLED:'false',V3_LOCAL_DATA_PREVIEW:'false',NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development'});
let child:ReturnType<typeof spawn>|undefined;
const cycle=async()=>{const r=await fetch('http://localhost:3351/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${cron}`},signal:AbortSignal.timeout(180000)});return {httpStatus:r.status,...await r.json()};};
try{
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3351'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout!.resume();child.stderr!.resume();
 let ready=false;for(let i=0;i<40;i++){try{const r=await fetch('http://localhost:3351/en',{signal:AbortSignal.timeout(3000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'LOCAL_APP_UNAVAILABLE');
 report.pausedHttpBefore=await cycle();assert.equal((report.pausedHttpBefore as {status:string}).status,'paused');
 // Prime the real homepage cache before publication; the route must invalidate it.
 report.homepageBeforeContainsArticle=(await (await fetch('http://localhost:3351/en')).text()).includes(preflight.prospectiveSlug);
 assert.equal(report.homepageBeforeContainsArticle,false);
 await db.query("INSERT INTO editorial_automation_audit(action,detail) VALUES('v35-nfl-honor-authorized-pilot',$1)",[JSON.stringify({eventKey:preflight.facts.eventKey,maximumCalls:5,reservationMicroUsd:20000,realClock:true})]);
 await repo.control({paused:false});
 report.cycle=await cycle();
 // Immediate normal scheduler invocation must be a no-op, not a second paid attempt.
 const rerun=await cycle();assert.equal(rerun.status,'not-due');report.immediateRerun=rerun;
 report.homepageAfterContainsArticle=(await (await fetch('http://localhost:3351/en')).text()).includes(preflight.prospectiveSlug);
}catch{report.failure='LOCAL_PILOT_FAILED_NO_RETRY';}
finally{
 await repo.control({paused:true});
 report.emergencyPause=await cycle().catch(()=>({status:'LOCAL_HTTP_UNAVAILABLE'}));
 report.archivesUnchanged=archives()===beforeArchives;
 report.runs=(await db.query('SELECT id,started_at,status,requests_used,model_microusd_reserved,model_microusd_used,input_tokens,output_tokens,result FROM editorial_automation_runs WHERE started_at>=$1',[report.at])).rows;
 report.event=(await db.query('SELECT event_key,state,reason,attempts,news_slug FROM editorial_automation_events WHERE event_key=$1',[preflight.facts.eventKey])).rows;
 report.publications=Number((await db.query<{count:string}>("SELECT count(*) FROM editorial_news WHERE NOT archived AND published->>'sourceUrl'=$1",[preflight.facts.sourceUrl])).rows[0].count);
 if(report.publications===1){const qa=spawnSync(process.execPath,['scripts/v35-nfl-public-qa.mjs'],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2000000});report.browserPassed=qa.status===0;}
 report.remainingValidationUsd=(1000000-80000-Number(sql('SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) FROM editorial_automation_runs')))/1000000;
 child?.kill();await db.close();sql(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL; REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}; REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}; REVOKE USAGE ON SCHEMA public FROM ${role};`);
 report.pausedAfterDisconnect=sql('SELECT paused FROM editorial_automation_control')==='t';backup();report.backupCompleted=true;
 await mkdir('output/v3-qa/v35/newsroom',{recursive:true});await writeFile('output/v3-qa/v35/newsroom/nfl-scheduled-pilot.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
