/** Temporary public-content rendering only. No migrations, model key or automation activation. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const sql=input=>{const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,'LOCAL_SQL_FAILED');return r.stdout.trim();};
assert.equal(sql('SELECT current_database()'),'livasports_v3_qa');assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
const role='livasports_v35_public_preview',password=randomBytes(32).toString('base64url');
assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`),'0','PREVIEW_ALREADY_CREATED');
sql(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now()+3600000).toISOString()}'; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON editorial_news,sports_snapshots TO ${role};`);
const uri=new URL('postgresql://127.0.0.1:55475/livasports_v3_qa');uri.username=role;uri.password=password;
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['path','systemroot','windir','comspec','pathext','temp','tmp','home','userprofile','appdata','localappdata','lang','tz'].includes(k.toLowerCase())));
Object.assign(env,{DATABASE_URL:uri.href,V3_NEWS_AUTOMATION_ENABLED:'false',V3_NEWS_MODEL_ENABLED:'false',V3_NEWS_BUDGET_MODE:'validation',V3_OPENLIGA_AUTOMATION_ENABLED:'false',V3_LOCAL_DATA_PREVIEW:'false',OPENAI_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development'});
let child,timer;
try{
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3351'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();process.on('SIGINT',()=>child.kill());
 timer=setTimeout(()=>child.kill(),30*60000);
 for(let i=0;i<45;i++){try{const r=await fetch('http://localhost:3351/en',{signal:AbortSignal.timeout(3000)});if(r.ok){console.log(JSON.stringify({origin:'http://localhost:3351',contentWrites:false,modelEnabled:false,automationEnabled:false,expiryMinutes:30}));break;}}catch{}if(i===44)throw Error('LOCAL_PREVIEW_UNAVAILABLE');await new Promise(r=>setTimeout(r,1000));}
 await new Promise(r=>child.once('exit',r));
}finally{clearTimeout(timer);child?.kill();sql(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL; REVOKE SELECT ON editorial_news,sports_snapshots FROM ${role}; REVOKE USAGE ON SCHEMA public FROM ${role};`);}
