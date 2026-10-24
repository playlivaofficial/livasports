// Only the explicitly reviewed EuroLeague snapshot. NBA conflicts are NOT cleared by this script.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
assert.ok(process.argv.slice(2).every(a=>['--production','--publish-reviewed'].includes(a)));
assert.ok(process.argv.includes('--publish-reviewed'));
const production=process.argv.includes('--production'),base=production?'https://livasports.com':'http://localhost:3351';
const root='output/v3-source-audit/2026-10-24T09-11-30.663Z/';
const source=await readFile(root+'euroleague-source.json'),normalized=await readFile(root+'euroleague-normalized.json');
assert.equal(createHash('sha256').update(source).digest('hex'),'1176a9b1c135cbdb2902dbc1da8fbc3841d2e5d3f4c39957f6c24aaf1146932d');
assert.equal(createHash('sha256').update(normalized).digest('hex'),'00f95bf66eb7266bb20bf881f21b8cc8be06d78d2dd3eb261498599300551dec');
const draft=JSON.parse(normalized).snapshot;assert.equal(draft.competitionId,'euroleague');assert.equal(draft.observedAt,'2026-10-23');assert.equal(draft.entities.length,20);
const keyText=await readFile(production?'../../output/hardening-owner-permanent-key.txt':'output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8');
const key=production?keyText.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim():keyText.trim();assert.ok(key);
const headers={Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const login=await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
try{
 const paused=async()=>assert.equal((await(await fetch(base+'/api/owner/news/automation',{headers})).json()).paused,true);
 await paused();const before=await(await fetch(base+'/api/owner/sports',{headers})).json();assert.ok(Array.isArray(before.records));
 if(!production)assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 const snapshotKey=draft.competitionId+':'+draft.season;let record=before.records.find(r=>r.key===snapshotKey),actions=[];
 // Existing approved publications are never silently replaced. A separate review is required.
 if(record?.published){assert.deepEqual(record.published,draft,'Different publication requires a separate reviewed update');}
 else{
  if(record)assert.deepEqual(record.draft,draft,'Different existing draft requires explicit reconciliation');
  for(const action of [...(record?[]:['create']),'review','publish']){
   const r=await fetch(base+'/api/owner/sports',{method:'POST',headers,body:JSON.stringify({action,key:snapshotKey,revision:record?.revision??0,...(action==='create'?{draft}:{}),...(action==='review'?{confirmed:true}:{})})});assert.equal(r.status,200,action);record=(await r.json()).record;actions.push(action);
  }
 }
 assert.deepEqual(record.published,draft);
 // Existing tag invalidation is stale-while-revalidate. Bounded readback, never another mutation.
 let publicRecord;
 for(let attempt=0;attempt<3;attempt++){
  const result=await fetch(base+'/api/public/sports/snapshots/euroleague');
  if(result.status===200){publicRecord=(await result.json()).snapshot;break;}
  assert.equal(result.status,404);await new Promise(resolve=>setTimeout(resolve,700));
 }
 assert.deepEqual(publicRecord,draft,'Published snapshot must become publicly readable');
 const after=await(await fetch(base+'/api/owner/sports',{headers})).json();assert.deepEqual(before.refresh,after.refresh);assert.deepEqual(before.records.filter(r=>r.key!==snapshotKey),after.records.filter(r=>r.key!==snapshotKey));await paused();
 if(!production)assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 const report={at:new Date().toISOString(),origin:base,competition:'euroleague',source:'Wikipedia contributors / CC BY-SA 4.0',dataAsOf:draft.observedAt,revision:record.revision,clubs:20,actions,publicReadback:true,otherRecordsPreserved:true,paused:true,modelCalls:0,providerRequests:0};const dir=`output/v3-qa/v33/basketball/${production?'production':'local'}`;await mkdir(dir,{recursive:true});await writeFile(dir+'/publication.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'logout'})});}
