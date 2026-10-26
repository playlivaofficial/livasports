// One local real-clock acceptance cycle. Never Production; no synthetic timestamps.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PostgresDatabaseClient} from '../src/database/client';
import {AutomationRepository} from '../src/editorial/automation/repository';
import {runNewsAutomation} from '../src/editorial/automation/runner';
assert.equal(process.argv[2],'--one-authorized-local-cycle');
const dir='output/v3-qa/v34/newsroom';await mkdir(dir,{recursive:true});
const sql=(query:string)=>{const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true,timeout:20000});if(r.status!==0)throw Error('LOCAL_SQL_FAILED');return r.stdout.trim();};
const backup=()=>assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
const env=await readFile('.env.local','utf8'),key=env.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');assert.ok(key,'LOCAL_KEY_MISSING');
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
assert.equal(sql('SELECT historical_reserved_microusd FROM local_validation_epoch'),'80000');
assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname='local_validation_budget' AND tgenabled='O'"),'1');
assert.equal(sql("SELECT count(*) FROM editorial_automation_audit WHERE action='v34-local-scheduled-pilot'"),'0','ONE_RUN_AUTHORIZATION_CONSUMED');
assert.equal(sql("SELECT count(*) FROM editorial_automation_runs WHERE started_at>now()-interval '6 hours' OR (status='running' AND lease_until>now())"),'0','NOT_DUE');
const reserved=Number(sql('SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) FROM editorial_automation_runs'));assert.ok(reserved+80000+20000<=1000000);
backup();const password=randomBytes(32).toString('base64url'),role='livasports_v34_news_pilot';
assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`),'0');
sql(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};`);
const uri=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');uri.username=role;uri.password=password;
let db=new PostgresDatabaseClient(uri.href,undefined,{statementTimeoutMs:5000}),repo=new AutomationRepository(db),sourceCalls=0,modelCalls=0;
const report:Record<string,unknown>={armedAt:new Date().toISOString(),localOnly:true,clock:'real elapsed time; not a six-hour/daily reliability proof',productionWrites:0};
const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(url.origin==='https://api.openai.com'){assert.ok(++modelCalls<=5,'MODEL_CALL_CAP');}else assert.ok(++sourceCalls<=4,'SOURCE_CALL_CAP');return fetch(input,init);};
try{
 await db.query("INSERT INTO editorial_automation_audit(action,detail) VALUES('v34-local-scheduled-pilot',$1)",[JSON.stringify({maximumModelCalls:5,reserveMicroUsd:20000,sourceRequestCap:4,realClock:true})]);
 // An actual timer invokes the unchanged scheduler service; no per-article intervention.
 await new Promise(r=>setTimeout(r,60000));report.triggeredAt=new Date().toISOString();
 await repo.control({paused:false});report.cycle=await runNewsAutomation(repo,{key,validationOnly:true,fetcher});
 await repo.control({paused:true});report.pauseAfterCycle=true;
 await new Promise(r=>setTimeout(r,60000));report.secondTickAt=new Date().toISOString();
 await repo.control({paused:false});const second=await runNewsAutomation(repo,{key,validationOnly:true,fetcher});assert.equal(second.status,'not-due');report.secondTick=second;
 await repo.control({paused:true});const stopped=await runNewsAutomation(repo,{key,validationOnly:true,fetcher});assert.equal(stopped.status,'paused');report.emergencyPause=stopped;
 const runs=await db.query('SELECT started_at,status,requests_used,model_microusd_reserved,model_microusd_used,input_tokens,output_tokens,result FROM editorial_automation_runs WHERE started_at >= $1 ORDER BY started_at',[report.triggeredAt]);
 report.runs=runs.rows;report.duplicateSourcePublications=Number((await db.query<{count:string}>("SELECT count(*) FROM (SELECT published->>'sourceUrl' FROM editorial_news WHERE published IS NOT NULL AND NOT archived GROUP BY 1 HAVING count(*)>1) d")).rows[0].count);
}catch{report.failure='LOCAL_PILOT_FAILED_NO_RETRY';}
finally{
 await repo.control({paused:true});report.sourceCalls=sourceCalls;report.modelCalls=modelCalls;
 await db.close();db=new PostgresDatabaseClient(uri.href,undefined,{statementTimeoutMs:5000});repo=new AutomationRepository(db);
 report.pausedAfterReconnect=(await db.query<{paused:boolean}>('SELECT paused FROM editorial_automation_control')).rows[0].paused;
 report.remainingValidationUsd=(1000000-80000-Number((await db.query<{sum:string}>('SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) AS sum FROM editorial_automation_runs')).rows[0].sum))/1000000;
 report.finishedAt=new Date().toISOString();await db.close();sql(`DROP OWNED BY ${role}; DROP ROLE ${role};`);backup();report.backupCompleted=true;
 await writeFile(dir+'/real-clock-pilot.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
