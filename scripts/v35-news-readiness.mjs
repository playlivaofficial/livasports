/** Non-paid acceptance in a separate synthetic schema. Preserved public data is read-only. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
function sql(input){const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,'ISOLATED_SQL_FAILED');return r.stdout.trim();}
assert.equal(sql('SELECT current_database()'),'livasports_v3_qa');
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
assert.equal(sql('SELECT epoch FROM local_validation_epoch'),'local-rebuild-2026-10-22');
const preservedSql="SELECT md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) FROM %TABLE% t";
const tables=['editorial_news','editorial_news_audit','sports_snapshots','sports_snapshot_audit','editorial_automation_control','editorial_automation_runs','editorial_automation_events','editorial_generation_evidence','local_validation_epoch'];
const fingerprint=()=>tables.map(table=>sql(preservedSql.replace('%TABLE%',table)));
const before=fingerprint(),password=randomBytes(32).toString('base64url');
const url=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');url.username='livasports_v35_readiness_qa';url.password=password;
try{
 sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_v35_readiness_qa') THEN CREATE ROLE livasports_v35_readiness_qa; END IF; END $$; ALTER ROLE livasports_v35_readiness_qa LOGIN PASSWORD '${password}'; GRANT CREATE ON DATABASE livasports_v3_qa TO livasports_v35_readiness_qa;`);
 // No model credentials, production URL or read/write privileges on preserved public tables.
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz'].includes(k.toLowerCase())));
 const run=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-news-automation-db-qa.ts'],{env:{...env,V3_QA_DATABASE_URL:url.href},windowsHide:true,encoding:'utf8',timeout:90000});
 assert.equal(run.status,0,'SYNTHETIC_DATABASE_ACCEPTANCE_FAILED');
 const evidence=JSON.parse(await readFile('output/v3-qa/acceptance-2026-10-21/automation-db.json','utf8'));
 assert.deepEqual(fingerprint(),before,'PRESERVED_DATA_CHANGED');
 const state=JSON.parse(sql("SELECT json_build_object('paused',(SELECT paused FROM editorial_automation_control),'nextEligibleRun',(SELECT max(started_at)+interval '6 hours' FROM editorial_automation_runs),'historicalUnavailableMicroUsd',(SELECT historical_reserved_microusd FROM local_validation_epoch),'epochReservedMicroUsd',(SELECT coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0) FROM editorial_automation_runs),'epochMeasuredMicroUsd',(SELECT coalesce(sum(model_microusd_used),0) FROM editorial_automation_runs),'runningJobs',(SELECT count(*) FROM editorial_automation_runs WHERE status='running'))"));
 const report={...evidence,preservedTablesUnchanged:tables,localState:state,remainingValidationMicroUsd:1000000-state.historicalUnavailableMicroUsd-state.epochReservedMicroUsd,realElapsedDailyOperationProven:false};
 await mkdir('output/v3-qa/v35/newsroom',{recursive:true});await writeFile('output/v3-qa/v35/newsroom/readiness.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{sql('ALTER ROLE livasports_v35_readiness_qa NOLOGIN PASSWORD NULL; REVOKE CREATE ON DATABASE livasports_v3_qa FROM livasports_v35_readiness_qa;');}
