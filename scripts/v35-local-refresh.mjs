/** Isolated, bounded acceptance. No Production URL, model credential or cadence override. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
function sql(input){const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,'ISOLATED_SQL_FAILED');return r.stdout.trim();}
assert.equal(sql('SELECT current_database()'),'livasports_v3_qa');
assert.equal(sql('SELECT epoch FROM local_validation_epoch'),'local-rebuild-2026-10-22');
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
const password=randomBytes(32).toString('base64url'),url=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');url.username='livasports_v35_refresh_qa';url.password=password;
try{
 sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_v35_refresh_qa') THEN CREATE ROLE livasports_v35_refresh_qa; END IF; END $$; ALTER ROLE livasports_v35_refresh_qa LOGIN PASSWORD '${password}'; GRANT USAGE ON SCHEMA public TO livasports_v35_refresh_qa; GRANT SELECT ON local_validation_epoch,editorial_automation_control TO livasports_v35_refresh_qa; GRANT SELECT,INSERT,UPDATE ON sports_snapshots,sports_snapshot_audit,sports_source_refresh TO livasports_v35_refresh_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_v35_refresh_qa;`);
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(DATABASE|POSTGRES|OPENAI|CRON_SECRET|VERCEL|V3_)/i.test(k)));
 const run=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v35-refresh-acceptance.ts'],{env:{...env,V35_LOCAL_REFRESH_URL:url.href},windowsHide:true,encoding:'utf8',timeout:70000});
 // Child emits only explicitly constructed public-data evidence; never relay raw stderr.
 process.stdout.write(run.stdout.replaceAll(password,'[REDACTED]'));assert.equal(run.status,0,'LOCAL_REFRESH_ACCEPTANCE_FAILED');
}finally{sql("ALTER ROLE livasports_v35_refresh_qa NOLOGIN PASSWORD NULL;");}
