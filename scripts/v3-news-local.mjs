/** Local-only continuation harness. Reuses the preserved isolated DB; never reads a production URL. */
import assert from 'node:assert/strict';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
const directory='output/v3-qa/acceptance-2026-10-21';
const record=JSON.parse(await readFile(directory+'/migration.json','utf8'));
assert.equal(record.isolated,true);assert.equal(record.port,55475);assert.match(record.cluster,/^\/tmp\/livasports-v3-pr75-[A-Za-z0-9]+$/);
for(const path of ['.env','.env.local','.env.development.local','.env.production.local'])assert.equal(await access(path).then(()=>true,()=>false),false,'Use the env-file-free worktree');
function sql(text){const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h',record.cluster,'-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',windowsHide:true,timeout:20000});if(r.status!==0)throw Error('ISOLATED_SQL_FAILED');return r.stdout.trim();}
const before=sql("SELECT json_build_object('sports',count(*),'hash',md5(string_agg(row_to_json(s)::text,'' ORDER BY snapshot_key))) FROM sports_snapshots s; SELECT json_build_object('news',count(*),'hash',md5(string_agg(row_to_json(n)::text,'' ORDER BY slug))) FROM editorial_news n;");
const migration=await readFile('db/migrations/074_v3_news_automation.sql','utf8');sql(migration);sql(migration);sql(migration);
const after=sql("SELECT json_build_object('sports',count(*),'hash',md5(string_agg(row_to_json(s)::text,'' ORDER BY snapshot_key))) FROM sports_snapshots s; SELECT json_build_object('news',count(*),'hash',md5(string_agg(row_to_json(n)::text,'' ORDER BY slug))) FROM editorial_news n;");assert.equal(before,after);
const password=randomBytes(32).toString('base64url');
sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_acceptance_qa') THEN CREATE ROLE livasports_acceptance_qa LOGIN; END IF; END $$; ALTER ROLE livasports_acceptance_qa PASSWORD '${password}'; GRANT CREATE ON DATABASE livasports_v3_qa TO livasports_acceptance_qa; GRANT USAGE ON SCHEMA public TO livasports_acceptance_qa; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO livasports_acceptance_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_acceptance_qa;`);
const url=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');url.username='livasports_acceptance_qa';url.password=password;
const os=Object.fromEntries(Object.entries(process.env).filter(([key])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz'].includes(key.toLowerCase())));
const qa=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-news-automation-db-qa.ts'],{env:{...os,V3_QA_DATABASE_URL:url.href},encoding:'utf8',windowsHide:true,timeout:60000});process.stdout.write(qa.stdout);if(qa.status!==0){process.stderr.write(qa.stderr.replaceAll(password,'[REDACTED]'));throw Error('DB_ACCEPTANCE_FAILED');}
await mkdir(directory,{recursive:true});await writeFile(directory+'/074-preserved-data.json',JSON.stringify({at:new Date().toISOString(),applications:3,preserved:JSON.parse('['+before.replaceAll('\n',',')+']'),productionConnections:0},null,2));
if(!process.argv.includes('--serve'))process.exit(0);
// The running application has no schema-creation privilege. Acceptance uses a separate local role.
sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_news_runtime_qa') THEN CREATE ROLE livasports_news_runtime_qa LOGIN; END IF; END $$; ALTER ROLE livasports_news_runtime_qa PASSWORD '${password}'; GRANT USAGE ON SCHEMA public TO livasports_news_runtime_qa; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO livasports_news_runtime_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_news_runtime_qa;`);
url.username='livasports_news_runtime_qa';
// Only this approved key is read, in memory. No dotenv import or all-secret export.
let key=process.env.OPENAI_API_KEY?.trim()??'';
if(!key)try{const text=await readFile(resolve('../..','.env.local'),'utf8');const raw=text.split(/\r?\n/).find(line=>line.startsWith('OPENAI_API_KEY='))?.slice('OPENAI_API_KEY='.length).trim()??'';key=raw.replace(/^(["'])(.*)\1$/,'$2');}catch{}
if(process.argv.includes('--run-cycle')&&!key)throw Error('PRIVATE_MODEL_CREDENTIAL_MISSING_NO_CYCLE_EXECUTED');
const ownerKey=(await readFile(directory+'/local-owner-key.txt','utf8')).trim(),cron=randomBytes(48).toString('base64url');
const env={...os,DATABASE_URL:url.href,DATABASE_POSTGRES_URL:'',POSTGRES_URL:'',OWNER_QA_ACCESS_HASH:createHash('sha256').update(ownerKey).digest('hex'),OWNER_QA_SESSION_SECRET:randomBytes(48).toString('base64url'),CRON_SECRET:cron,OPENAI_API_KEY:key,V3_NEWS_AUTOMATION_ENABLED:'true',V3_NEWS_MODEL_ENABLED:key?'true':'false',V3_NEWS_BUDGET_MODE:'validation',V3_OPENLIGA_AUTOMATION_ENABLED:'false',V3_LOCAL_DATA_PREVIEW:'false',NEXT_TELEMETRY_DISABLED:'1',VERCEL:'',VERCEL_ENV:'',NODE_ENV:'development'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3351'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const redact=text=>[key,password,cron,ownerKey,env.OWNER_QA_SESSION_SECRET].filter(Boolean).reduce((s,secret)=>s.replaceAll(secret,'[REDACTED]'),String(text));
child.stdout.on('data',chunk=>process.stdout.write(redact(chunk)));child.stderr.on('data',chunk=>process.stderr.write(redact(chunk)));
process.on('SIGINT',()=>child.kill());
for(let i=0;i<60;i++){try{const response=await fetch('http://localhost:3351/api/owner/preview');if(response.ok)break;}catch{}if(i===59)throw Error('LOCAL_APP_UNAVAILABLE');await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify({localServer:'http://localhost:3351',keyConfigured:!!key,modelMode:env.V3_NEWS_MODEL_ENABLED,budgetMode:'validation',lifetimeCeilingUsd:1,productionConnections:0}));
if(process.argv.includes('--run-cycle')){
 sql('UPDATE editorial_automation_control SET paused=false');
 const response=await fetch('http://localhost:3351/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${cron}`}}),result=await response.json();
 const rerun=await fetch('http://localhost:3351/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${cron}`}}),duplicate=await rerun.json();
 const evidence={at:new Date().toISOString(),status:response.status,result,immediateRerunStatus:rerun.status,immediateRerun:duplicate,keyConfigured:!!key,modelLive:!!key,productionConnections:0};
 await writeFile(directory+'/news-live-cycle.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
await new Promise(r=>child.once('exit',r));
