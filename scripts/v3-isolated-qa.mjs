/** Local-only acceptance harness. Never reads an application .env file or a cloud database URL. */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, unlink, access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes, createHash} from 'node:crypto';
import {spawnSync, spawn} from 'node:child_process';
import pg from 'pg';
import {runOwnerAcceptance} from './v3-owner-acceptance.mjs';

const output='output/v3-qa/acceptance-2026-10-21';
const wsl=(args,input)=>{
  const result=spawnSync('wsl.exe',['-d','Ubuntu','--',...args],{encoding:'utf8',input,windowsHide:true,timeout:45000});
  if(result.status!==0)throw Error(`Isolated PostgreSQL command failed (${result.status}): ${result.stderr?.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]')}. No cloud connection attempted.`);
  return result.stdout.trim();
};
const service=process.argv.includes('--ci-service');
if(service)assert.equal(process.env.GITHUB_ACTIONS,'true','CI service mode is restricted to GitHub Actions');
// Next loads dotenv independently. Fail closed rather than importing local cloud credentials.
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']){
  const exists=await access(name).then(()=>true,()=>false);
  assert.equal(exists,false,`Run isolated acceptance from an env-file-free checkout (${name} exists)`);
}
const cluster=service?null:wsl(['mktemp','-d','/tmp/livasports-v3-pr75-XXXXXX']);
if(cluster)assert.match(cluster,/^\/tmp\/livasports-v3-pr75-[A-Za-z0-9]+$/);
const password=service?process.env.V3_QA_SERVICE_PASSWORD:randomBytes(32).toString('base64url');
assert.ok(password,'Explicit disposable CI service password required');
await mkdir(output,{recursive:true});
if(cluster){
const passwordFile=resolve(output,'local-db-init-password.txt');
await writeFile(passwordFile,password+'\n',{mode:0o600});
try{wsl(['/usr/lib/postgresql/18/bin/initdb','-D',cluster,'-U','livasports_v3_qa','--auth-local=trust','--auth-host=scram-sha-256',`--pwfile=${wsl(['wslpath','-a',passwordFile])}`,'--no-locale','--encoding=UTF8']);}finally{await unlink(passwordFile);}
wsl(['/usr/lib/postgresql/18/bin/pg_ctl','-D',cluster,'-l',cluster+'/server.log','-o',`-h 127.0.0.1 -p 55475 -k ${cluster}`,'-w','start']);
}
let application;
const stop=()=>{application?.kill();if(cluster)wsl(['/usr/lib/postgresql/18/bin/pg_ctl','-D',cluster,'-m','fast','-w','stop']);};
process.on('uncaughtException',error=>{console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]'));try{stop();}finally{process.exitCode=1;process.exit(1);}});
const config={host:'127.0.0.1',port:service?5432:55475,user:'livasports_v3_qa',password,database:'postgres',connectionTimeoutMillis:5000};
let admin;
for(let attempt=0;attempt<10;attempt++){
  admin=new pg.Client(config);
  try{await admin.connect();break;}catch(error){await admin.end();if(attempt===9)throw error;await new Promise(resolve=>setTimeout(resolve,500));}
}
await admin.query('CREATE DATABASE livasports_v3_qa');await admin.end();
const db=new pg.Client({...config,database:'livasports_v3_qa'});await db.connect();
const migration=await readFile('db/migrations/073_v3_sports_snapshots.sql','utf8');
await db.query("CREATE TABLE qa_existing_data (id integer PRIMARY KEY, value jsonb NOT NULL); INSERT INTO qa_existing_data VALUES (1,'{\"preserve\":true}')");
const before=(await db.query('SELECT * FROM qa_existing_data')).rows;
await db.query(migration);
const indexes=(await db.query("SELECT indexname FROM pg_indexes WHERE tablename LIKE 'sports_%' ORDER BY indexname")).rows.map(row=>row.indexname);
const rejected=[];
const insert="INSERT INTO sports_snapshots(snapshot_key,competition_id,season,draft,content_hash) VALUES ($1,$2,$3,$4,$5)";
const hash='a'.repeat(64);
async function reject(name,sql,values,code='23514'){
  await db.query('BEGIN');let actual;
  try{await db.query(sql,values);}catch(error){actual=error.code;}finally{await db.query('ROLLBACK');}
  assert.equal(actual,code,`${name} must be rejected by PostgreSQL`);rejected.push(name);
}
await reject('missing draft identity',insert,['bundesliga:2026/27','bundesliga','2026/27','{}',hash]);
await reject('null draft identity',insert,['bundesliga:2026/27','bundesliga','2026/27',JSON.stringify({competitionId:null,season:'2026/27'}),hash]);
await reject('mismatched identity',insert,['bundesliga:2026/27','bundesliga','2026/27',JSON.stringify({competitionId:'nfl',season:'2026/27'}),hash]);
await reject('invalid hash',insert,['bundesliga:2026/27','bundesliga','2026/27',JSON.stringify({competitionId:'bundesliga',season:'2026/27'}),'bad']);
await db.query(insert,['bundesliga:2026/27','bundesliga','2026/27',JSON.stringify({competitionId:'bundesliga',season:'2026/27'}),hash]);
await reject('duplicate edition',insert,['bundesliga:2026/27','bundesliga','2026/27',JSON.stringify({competitionId:'bundesliga',season:'2026/27'}),hash],'23505');
await reject('missing published identity',"UPDATE sports_snapshots SET published='{}'");
await reject('invalid review revision',"UPDATE sports_snapshots SET reviewed_revision=0,reviewed_at=now()");
await reject('unpaired review',"UPDATE sports_snapshots SET reviewed_revision=1");
await reject('future review revision',"UPDATE sports_snapshots SET reviewed_revision=2,reviewed_at=now()");
await reject('audit orphan',"INSERT INTO sports_snapshot_audit(snapshot_key,action,revision,content_hash,snapshot) VALUES ('missing:2026','save',1,$1,'{}')",[hash],'23503');
await reject('invalid backoff',"INSERT INTO sports_source_refresh(source_key,next_allowed_at,failures) VALUES ('qa',now(),9)");
await reject('invalid audit revision',"INSERT INTO sports_snapshot_audit(snapshot_key,action,revision,content_hash,snapshot) VALUES ('bundesliga:2026/27','save',0,$1,'{}')",[hash]);
await db.query('CREATE SCHEMA qa_atomic_rollback');await db.query('SET search_path TO qa_atomic_rollback');
try{await db.query(migration.replace('COMMIT;','SELECT 1/0; COMMIT;'));assert.fail('injected migration failure must fail');}catch(error){assert.equal(error.code,'22012');await db.query('ROLLBACK');}
assert.equal((await db.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='qa_atomic_rollback'")).rows[0].count,'0');
await db.query('SET search_path TO public');
const preserved=(await db.query('SELECT * FROM sports_snapshots')).rows;
await db.query(migration);await db.query(migration);
assert.deepEqual((await db.query('SELECT * FROM sports_snapshots')).rows,preserved);
assert.deepEqual((await db.query('SELECT * FROM qa_existing_data')).rows,before);
await db.query('BEGIN');await db.query("UPDATE qa_existing_data SET value='{}'");await db.query('ROLLBACK');
assert.deepEqual((await db.query('SELECT * FROM qa_existing_data')).rows,before);
// Only the disposable row created above is removed, allowing the real HTTP publishing test.
await db.query("DELETE FROM sports_snapshots WHERE snapshot_key='bundesliga:2026/27'");
for(const name of ['021_owner_qa_login_rate_limit.sql','072_v2_editorial_newsroom.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql'])await db.query(await readFile('db/migrations/'+name,'utf8'));
// Reuse this disposable service only; no external credentials or real model calls.
const automationDbUrl=new URL('postgresql://127.0.0.1');automationDbUrl.port=String(config.port);automationDbUrl.username=config.user;automationDbUrl.password=config.password;automationDbUrl.pathname='/livasports_v3_qa';
const automationQA=spawn(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-news-automation-db-qa.ts'],{env:{...process.env,V3_QA_DATABASE_URL:automationDbUrl.href},stdio:'inherit',windowsHide:true});
assert.equal(await new Promise(resolve=>automationQA.once('exit',resolve)),0,'Isolated automation migration and publication acceptance');
const appPassword=randomBytes(32).toString('base64url');
await db.query((await db.query("SELECT format('CREATE ROLE livasports_v3_app LOGIN PASSWORD %L', $1::text) AS sql",[appPassword])).rows[0].sql);
await db.query('GRANT USAGE ON SCHEMA public TO livasports_v3_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO livasports_v3_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_v3_app');
await db.query('SET ROLE livasports_v3_app');await reject('runtime role cannot create schema objects','CREATE TABLE qa_forbidden (id integer)',undefined,'42501');await db.query('RESET ROLE');
const evidence={at:new Date().toISOString(),database:(await db.query('SELECT version()')).rows[0].version,isolated:true,environment:service?'GitHub Actions PostgreSQL service':'local PostgreSQL',cluster,port:config.port,migration:'073',applications:3,indexes,constraints:rejected,repeatability:'PASS',atomicFailureRollback:'PASS',existingDataPreserved:true,applicationRollbackCompatible:true,rollbackPolicy:'Revert application only; preserve additive tables and publications. No destructive down migration.',productionConnections:0};
await mkdir(output,{recursive:true});await writeFile(output+'/migration.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));await db.end();
if(process.argv.includes('--serve')||service){
  const ownerKey=randomBytes(32).toString('base64url');
  // Ephemeral test credentials only, in ignored output. No production secrets are read or copied.
  if(!service)await writeFile(output+'/local-owner-key.txt',ownerKey,{mode:0o600});
  const operatingSystem=Object.fromEntries(Object.entries(process.env).filter(([key])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz','ci'].includes(key.toLowerCase())));
  const applicationUrl=new URL('postgresql://127.0.0.1');
  applicationUrl.port=String(config.port);applicationUrl.username='livasports_v3_app';applicationUrl.password=appPassword;applicationUrl.pathname='/livasports_v3_qa';
  const env={...operatingSystem,DATABASE_URL:applicationUrl.href,DATABASE_POSTGRES_URL:'',POSTGRES_URL:'',OWNER_QA_ACCESS_HASH:createHash('sha256').update(ownerKey).digest('hex'),OWNER_QA_SESSION_SECRET:randomBytes(48).toString('base64url'),V3_LOCAL_DATA_PREVIEW:'false',V3_OPENLIGA_AUTOMATION_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',VERCEL:'',VERCEL_ENV:'',NODE_ENV:service?'production':'development'};
  if(service){const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,stdio:'inherit'});assert.equal(await new Promise(resolve=>build.once('exit',resolve)),0,'Database-backed production build');}
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next',service?'start':'dev','--hostname','127.0.0.1','--port','3351'],{env,windowsHide:true,stdio:'inherit'});
  application=child;
  process.on('SIGINT',()=>child.kill());
  for(let attempt=0;attempt<60;attempt++){try{const ready=await fetch('http://127.0.0.1:3351/api/owner/preview');if(ready.ok)break;}catch{}if(attempt===59)throw Error('Local application did not become ready');await new Promise(resolve=>setTimeout(resolve,1000));}
  const acceptanceDb=new pg.Client({...config,database:'livasports_v3_qa'});await acceptanceDb.connect();
  try{const workflow=await runOwnerAcceptance({origin:'http://localhost:3351',ownerKey,db:acceptanceDb});await writeFile(output+'/owner-workflow.json',JSON.stringify(workflow,null,2));console.log(JSON.stringify(workflow,null,2));}finally{await acceptanceDb.end();if(service)child.kill();}
  if(!service)await new Promise(resolve=>child.once('exit',resolve));
}
stop();
