import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base='http://localhost:3351',path='/api/owner/sports',key='colombia-primera-a:2026 Finalizacion';
const draft=JSON.parse(await readFile('output/v3-source-audit/colombia-recheck/reviewed-snapshot.json','utf8'));
assert.equal(draft.competitionId,'colombia-primera-a');assert.equal(draft.provenance[0].revisionId,1381387526);assert.equal(draft.observedAt,'2026-10-21');assert.equal(draft.entities.length,20);
const reconciliation=JSON.parse(await readFile('output/v3-source-audit/colombia-recheck/reconciliation.json','utf8'));assert.equal(reconciliation.matchingNumericFields,180);
function backup(){assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:30000}).status,0);}
const headers={Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const ownerKey=(await readFile('output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8')).trim();
const login=await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key:ownerKey})});assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
assert.equal((await fetch(base+path)).status,401);const state=await(await fetch(base+'/api/owner/news/automation',{headers})).json();assert.equal(state.paused,true);
const before=await(await fetch(base+path,{headers})).json();assert.ok(!before.records.some(r=>r.key===key),'Refuse to overwrite an existing record');
backup();let record;const actions=[];
async function action(action,extra={},status=200){const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify({action,key,revision:record?.revision??0,...extra})});assert.equal(r.status,status,action);const body=await r.json();if(body.record)record=body.record;actions.push({action,status});}
await action('create',{draft});await action('save',{draft});await action('publish',{},409);await action('review',{confirmed:true});await action('publish');assert.deepEqual(record.published,draft);
const after=await(await fetch(base+path,{headers})).json();assert.deepEqual(after.refresh,before.refresh);assert.deepEqual(after.records.filter(r=>r.key!==key),before.records);
const routes=[];for(const [lang,namespace]of [['en','sports'],['mx','deportes'],['br','esportes']]){const url=base+'/'+lang+'/'+namespace+'/football/colombia-primera-a';const r=await fetch(url);assert.equal(r.status,200);const html=await r.text();for(const e of draft.entities)assert.ok(html.includes(e.name));assert.ok(html.includes('1381387526'));routes.push(url);}
assert.equal((await(await fetch(base+'/api/owner/news/automation',{headers})).json()).paused,true);backup();
const report={at:new Date().toISOString(),localOnly:true,key,rows:20,cutoff:draft.observedAt,sourceRevision:1381387526,sourceBoundSha256:createHash('sha256').update(JSON.stringify(draft)).digest('hex'),authenticatedOwner:true,actions,otherRecordsPreserved:true,schedulerUnchanged:true,paused:true,backupBeforeAndAfter:true,routes,modelCalls:0};
await writeFile('output/v3-qa/acceptance-2026-10-22/colombia-owner-publication.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
