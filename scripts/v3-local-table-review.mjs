import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
function sql(input){const result=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:20000});if(result.status!==0)throw Error('ISOLATED_SQL_FAILED');return result.stdout.trim();}
assert.equal(sql('SELECT epoch FROM local_validation_epoch'),'local-rebuild-2026-10-22');assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
function backup(){assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:30000}).status,0);}
backup();const password=randomBytes(32).toString('base64url');
sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='livasports_table_review_qa') THEN CREATE ROLE livasports_table_review_qa LOGIN; END IF; END $$; ALTER ROLE livasports_table_review_qa LOGIN PASSWORD '${password}'; GRANT USAGE ON SCHEMA public TO livasports_table_review_qa; GRANT SELECT ON local_validation_epoch,editorial_automation_control,sports_source_refresh TO livasports_table_review_qa; GRANT SELECT,INSERT,UPDATE ON sports_snapshots,sports_snapshot_audit TO livasports_table_review_qa; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO livasports_table_review_qa;`);
const url=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');url.username='livasports_table_review_qa';url.password=password;
const os=Object.fromEntries(Object.entries(process.env).filter(([key])=>['path','systemroot','windir','comspec','pathext','temp','tmp','userprofile','appdata','localappdata'].includes(key.toLowerCase())));
try{const child=spawnSync(process.execPath,['--require','./scripts/tsx-windows-preload.cjs','--import','tsx','scripts/v3-local-table-review.ts'],{env:{...os,V3_QA_DATABASE_URL:url.href},encoding:'utf8',windowsHide:true,timeout:30000});process.stdout.write(child.stdout.replaceAll(password,'[REDACTED]'));if(child.status!==0)throw Error('TABLE_REVIEW_FAILED');}
finally{sql('ALTER ROLE livasports_table_review_qa NOLOGIN;');backup();}
