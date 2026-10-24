// Explicit Owner-authenticated publication of four reviewed CC0 archives, never a table/live feed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const production=process.argv.includes('--production');
assert.ok(process.argv.slice(2).every(x=>['--production','--publish-reviewed'].includes(x)));
assert.ok(process.argv.includes('--publish-reviewed'),'Explicit reviewed publication required');
const base=production?'https://livasports.com':'http://localhost:3351',dir='output/v3-qa/v32/source-review';
const review=JSON.parse(await readFile(dir+'/review.json','utf8'));assert.equal(review.reports.length,4);
// No access tokens, cookies or private Owner payloads are written to artifacts.
const keyText=await readFile(production?'../../output/hardening-owner-permanent-key.txt':'output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8');
const key=production?keyText.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim():keyText.trim();assert.ok(key);
const headers={Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const login=await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});assert.equal(login.status,200,'Normal Owner authentication required');headers.Cookie=login.headers.get('set-cookie').split(';')[0];
try{
 const automation=await(await fetch(base+'/api/owner/news/automation',{headers})).json();assert.equal(automation.paused,true);
 const before=await(await fetch(base+'/api/owner/sports',{headers})).json();assert.ok(Array.isArray(before.records));
 if(!production)assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 const changed=[],ids=new Set(review.reports.map(x=>x.competitionId));
 for(const report of review.reports){
  assert.equal(report.mode,'historical');assert.equal(report.tables,0);assert.equal(report.observedThrough,'2026-09-20');
  const raw=await readFile(`${dir}/${report.competitionId}-source.json`,'utf8');assert.equal(createHash('sha256').update(raw).digest('hex'),report.sourceSha256);
  const draft=JSON.parse(await readFile(`${dir}/${report.competitionId}-snapshot.json`,'utf8'));assert.equal(draft.mode,'historical');assert.equal(draft.tables.length,0);assert.equal(draft.events.length,report.results);
  const snapshotKey=draft.competitionId+':'+draft.season;const existing=before.records.find(r=>r.key===snapshotKey);
  if(existing){assert.deepEqual(existing.published,draft,'Never overwrite a different existing record');changed.push({competitionId:draft.competitionId,status:'already-published'});continue;}
  let record;for(const action of ['create','review','publish']){
   const r=await fetch(base+'/api/owner/sports',{method:'POST',headers,body:JSON.stringify({action,key:snapshotKey,revision:record?.revision??0,...(action==='create'?{draft}:{}),...(action==='review'?{confirmed:true}:{})})});assert.equal(r.status,200,action+' '+draft.competitionId);record=(await r.json()).record;
  }
  assert.deepEqual(record.published,draft);const response=await fetch(base+'/api/public/sports/snapshots/'+draft.competitionId);assert.equal(response.status,200);assert.deepEqual((await response.json()).snapshot,draft);
  changed.push({competitionId:draft.competitionId,results:draft.events.length,teams:draft.entities.length,cutoff:draft.observedAt,sourceHash:report.sourceSha256,actions:['create','review','publish'],status:'published'});
 }
 const after=await(await fetch(base+'/api/owner/sports',{headers})).json();assert.deepEqual(after.refresh,before.refresh);assert.deepEqual(after.records.filter(r=>!ids.has(r.draft.competitionId)),before.records.filter(r=>!ids.has(r.draft.competitionId)));
 assert.equal((await(await fetch(base+'/api/owner/news/automation',{headers})).json()).paused,true);
 if(!production)assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 const out=`output/v3-qa/v32/${production?'production':'local'}`;await mkdir(out,{recursive:true});await writeFile(out+'/archive-publication.json',JSON.stringify({at:new Date().toISOString(),origin:base,changed,otherRecordsPreserved:true,schedulerUnchanged:true,paused:true,modelCalls:0},null,2));console.log(JSON.stringify(changed));
}finally{await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'logout'})});}
