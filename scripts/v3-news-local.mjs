/** Local-only continuation harness. Reuses the preserved isolated DB; never reads a production URL. */
import assert from 'node:assert/strict';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes,createHash,createHmac} from 'node:crypto';
const directory='output/v3-qa/acceptance-2026-10-22';
const record={isolated:true,port:55475,cluster:'/home/nika1578/.local/share/livasports-pr75/socket'};
// No volatile cluster fallback and no Production connection configuration.
assert.equal(record.cluster,'/home/nika1578/.local/share/livasports-pr75/socket');
for(const path of ['.env','.env.development.local','.env.production.local'])assert.equal(await access(path).then(()=>true,()=>false),false,'No ambient database or Production configuration');
const privateLocal=await readFile('.env.local','utf8').catch(()=> '');
const localSettings=privateLocal.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
assert.ok(localSettings.every(line=>/^OPENAI_API_KEY\s*=/.test(line))&&localSettings.length<=1,'Only OPENAI_API_KEY is permitted in this isolated worktree env file');
function sql(text){const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h',record.cluster,'-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',windowsHide:true,timeout:20000});if(r.status!==0)throw Error('ISOLATED_SQL_FAILED');return r.stdout.trim();}
assert.equal(sql("SELECT epoch||':'||historical_reserved_microusd FROM local_validation_epoch"),'local-rebuild-2026-10-22:80000','Recovery accounting must exist before local validation');
assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname='local_validation_budget' AND tgenabled='O'"),'1','Recovery budget trigger must be active');
// Public session reads use the shared request limiter even when OAuth is disabled.
// Reuse only 027's independent limiter DDL; its later analytics indexes require unrelated schemas.
const limiterMigration=await readFile('db/migrations/027_launch_request_limits.sql','utf8');
assert.ok(limiterMigration.includes('-- Internal alert drills'));
sql(limiterMigration.split('-- Internal alert drills')[0]+'COMMIT;');
sql("DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_news_runtime_qa') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON request_rate_limits TO livasports_news_runtime_qa; END IF; END $$;");
function backup(){const result=spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw Error('LOCAL_BACKUP_FAILED');}
const before=sql("SELECT json_build_object('sports',count(*),'hash',md5(string_agg(row_to_json(s)::text,'' ORDER BY snapshot_key))) FROM sports_snapshots s; SELECT json_build_object('news',count(*),'hash',md5(string_agg(row_to_json(n)::text,'' ORDER BY slug))) FROM editorial_news n;");
const migration=await readFile('db/migrations/074_v3_news_automation.sql','utf8');sql(migration);sql(migration);sql(migration);
const reviewMigration=await readFile('db/migrations/075_v3_news_review_evidence.sql','utf8');sql(reviewMigration);sql(reviewMigration);
const after=sql("SELECT json_build_object('sports',count(*),'hash',md5(string_agg(row_to_json(s)::text,'' ORDER BY snapshot_key))) FROM sports_snapshots s; SELECT json_build_object('news',count(*),'hash',md5(string_agg(row_to_json(n)::text,'' ORDER BY slug))) FROM editorial_news n;");assert.equal(before,after);
const password=randomBytes(32).toString('base64url');
sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_acceptance_qa') THEN CREATE ROLE livasports_acceptance_qa LOGIN; END IF; END $$; ALTER ROLE livasports_acceptance_qa PASSWORD '${password}'; GRANT CREATE ON DATABASE livasports_v3_qa TO livasports_acceptance_qa; GRANT USAGE ON SCHEMA public TO livasports_acceptance_qa; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO livasports_acceptance_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_acceptance_qa;`);
const url=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');url.username='livasports_acceptance_qa';url.password=password;
const os=Object.fromEntries(Object.entries(process.env).filter(([key])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz'].includes(key.toLowerCase())));
const qa=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-news-automation-db-qa.ts'],{env:{...os,V3_QA_DATABASE_URL:url.href},encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(qa.stdout);if(qa.status!==0){process.stderr.write(qa.stderr.replaceAll(password,'[REDACTED]'));throw Error('DB_ACCEPTANCE_FAILED');}
await mkdir(directory,{recursive:true});await writeFile(directory+'/074-preserved-data.json',JSON.stringify({at:new Date().toISOString(),applications:3,preserved:JSON.parse('['+before.replaceAll('\n',',')+']'),productionConnections:0},null,2));
if(process.argv.includes('--refresh-sports')){
 backup();
 const sports=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-local-sports.ts'],{env:{...os,V3_QA_DATABASE_URL:url.href},encoding:'utf8',windowsHide:true,timeout:60000});
 process.stdout.write(sports.stdout);backup();
 if(sports.status!==0)throw Error('ISOLATED_SPORTS_ACCEPTANCE_FAILED');
}
if(!process.argv.includes('--serve'))process.exit(0);
// The running application has no schema-creation privilege. Acceptance uses a separate local role.
sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_news_runtime_qa') THEN CREATE ROLE livasports_news_runtime_qa LOGIN; END IF; END $$; ALTER ROLE livasports_news_runtime_qa PASSWORD '${password}'; GRANT USAGE ON SCHEMA public TO livasports_news_runtime_qa; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO livasports_news_runtime_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_news_runtime_qa;`);
url.username='livasports_news_runtime_qa';
// Only this approved key is read, in memory. No dotenv import or all-secret export.
let key=process.env.OPENAI_API_KEY?.trim()??'';
if(process.argv.includes('--key-stdin')&&process.stdin.isTTY)process.stdin.setRawMode(true);
if(process.argv.includes('--key-stdin'))key=await new Promise((resolve,reject)=>{let incoming='';const onData=chunk=>{incoming+=chunk;if(incoming.length>1024){process.stdin.off('data',onData);process.stdin.pause();reject(Error('PRIVATE_CREDENTIAL_INPUT_TOO_LARGE'));return;}if(/[\r\n]/.test(incoming)){process.stdin.off('data',onData);process.stdin.pause();resolve(incoming.trim());incoming='';}};process.stdin.on('data',onData);process.stdin.once('end',()=>{if(incoming.trim())resolve(incoming.trim());else reject(Error('PRIVATE_CREDENTIAL_INPUT_MISSING'));});});
if(process.argv.includes('--key-stdin')&&process.stdin.isTTY)process.stdin.setRawMode(false);
if(!key){const raw=localSettings[0]?.slice(localSettings[0].indexOf('=')+1).trim()??'';key=raw.replace(/^(["'])(.*)\1$/,'$2');}
if(process.argv.includes('--run-cycle')&&!key)throw Error('PRIVATE_MODEL_CREDENTIAL_MISSING_NO_CYCLE_EXECUTED');
const ownerKey=(await readFile('output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8')).trim(),cron=randomBytes(48).toString('base64url');
const env={...os,DATABASE_URL:url.href,DATABASE_POSTGRES_URL:'',POSTGRES_URL:'',OWNER_QA_ACCESS_HASH:createHash('sha256').update(ownerKey).digest('hex'),OWNER_QA_SESSION_SECRET:randomBytes(48).toString('base64url'),CRON_SECRET:cron,OPENAI_API_KEY:key,V3_NEWS_AUTOMATION_ENABLED:'true',V3_NEWS_MODEL_ENABLED:key?'true':'false',V3_NEWS_BUDGET_MODE:'validation',V3_OPENLIGA_AUTOMATION_ENABLED:'false',V3_LOCAL_DATA_PREVIEW:'false',NEXT_TELEMETRY_DISABLED:'1',VERCEL:'',VERCEL_ENV:'',NODE_ENV:'development'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3351'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const redact=text=>[key,password,cron,ownerKey,env.OWNER_QA_SESSION_SECRET].filter(Boolean).reduce((s,secret)=>s.replaceAll(secret,'[REDACTED]'),String(text));
child.stdout.on('data',chunk=>process.stdout.write(redact(chunk)));child.stderr.on('data',chunk=>process.stderr.write(redact(chunk)));
process.on('SIGINT',()=>child.kill());
for(let i=0;i<60;i++){try{const response=await fetch('http://localhost:3351/api/owner/preview');if(response.ok)break;}catch{}if(i===59)throw Error('LOCAL_APP_UNAVAILABLE');await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify({localServer:'http://localhost:3351',keyConfigured:!!key,modelMode:env.V3_NEWS_MODEL_ENABLED,budgetMode:'validation',lifetimeCeilingUsd:1,productionConnections:0}));
if(process.argv.includes('--run-cycle')){
 backup();
 const session=Buffer.from(JSON.stringify({v:1,id:randomBytes(24).toString('base64url'),expiresAt:Date.now()+3600000,preview:false})).toString('base64url');
 const signature=createHmac('sha256',env.OWNER_QA_SESSION_SECRET).update('livasports:owner:v1:'+env.OWNER_QA_ACCESS_HASH+':'+session).digest('base64url');
 const response=await fetch('http://localhost:3351/api/owner/news/automation',{headers:{Cookie:`__Host-livasports_owner=${session}.${signature}`}});
 assert.equal(response.status,200,'Actual local process must accept its isolated Owner session');
 const state=await response.json();assert.equal(state.modelConfigured,true);assert.equal(state.modelEnabled,true);assert.equal(state.budgetMode,'validation');assert.equal(state.paused,true);assert.equal(state.limits.maxValidationMicroUsd,1000000);
 const evidence={at:new Date().toISOString(),actualProcessCredentialAccessible:true,budgetMode:state.budgetMode,productionConnections:0};
 try{
  sql('UPDATE editorial_automation_control SET paused=false');
  const cycle=await fetch('http://localhost:3351/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${cron}`},signal:AbortSignal.timeout(180000)});evidence.status=cycle.status;evidence.result=await cycle.json();
  const rerun=await fetch('http://localhost:3351/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${cron}`},signal:AbortSignal.timeout(30000)});evidence.immediateRerunStatus=rerun.status;evidence.immediateRerun=await rerun.json();
 }catch{evidence.failure='LOCAL_CANARY_FAILED';}
 finally{
  sql('UPDATE editorial_automation_control SET paused=true');
  backup();
  evidence.paused=sql('SELECT paused FROM editorial_automation_control')==='t';
  evidence.usage=JSON.parse(sql("SELECT coalesce(json_agg(r ORDER BY started_at),'[]') FROM (SELECT started_at,status,model_microusd_reserved,model_microusd_used,input_tokens,output_tokens,result FROM editorial_automation_runs) r"));
  await writeFile(directory+'/news-live-cycle.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }
}
await new Promise(r=>child.once('exit',r));
