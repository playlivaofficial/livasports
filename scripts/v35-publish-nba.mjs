/** One exact source-reviewed snapshot, through normal Owner authentication/review/publication. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
assert.ok(process.argv.slice(2).every(x=>['--production','--publish-reviewed'].includes(x)));assert.ok(process.argv.includes('--publish-reviewed'));
const production=process.argv.includes('--production'),origin=production?'https://livasports.com':'http://localhost:3351',out='output/v3-qa/v35/reconciliation/';
const content=await readFile(out+'nba-reviewed.json');assert.equal(createHash('sha256').update(content).digest('hex'),'eba93de14439938ff50a56e427ed4774aecb9d3dc18eb85fad91e1fb9575484e');
const review=JSON.parse(await readFile(out+'nba-reviewed-manifest.json','utf8'));assert.equal(review.comparison.recordsVerified,30);assert.equal(review.comparison.officialSeedingVerified,false);assert.ok(Date.now()-Date.parse(review.independentCheckedAt)<86400000);
const draft=JSON.parse(content).snapshot;assert.equal(draft.competitionId,'nba');assert.equal(draft.mode,'manual');assert.equal(draft.observationBasis,'source-revision');
const privateText=await readFile(production?'../../output/hardening-owner-permanent-key.txt':'output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8');
const key=production?privateText.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim():privateText.trim();assert.ok(key);
const headers={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const login=await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
try{
 const get=async path=>{const r=await fetch(origin+path,{headers});assert.equal(r.status,200);return r.json();};
 const paused=async()=>assert.equal((await get('/api/owner/news/automation')).paused,true);await paused();
 const before=await get('/api/owner/sports'),snapshotKey='nba:'+draft.season;let record=before.records.find(r=>r.key===snapshotKey);assert.notEqual(record?.archived,true,'Never resurrect an archived Owner record');
 if(record?.published)assert.ok(Date.parse(draft.observedAt)>=Date.parse(record.published.observedAt));
 const backup=()=>assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 if(!production)backup();const actions=[];
 if(!isDeepStrictEqual(record?.published,draft))for(const action of [record?'save':'create','review','publish']){
  const r=await fetch(origin+'/api/owner/sports',{method:'POST',headers,body:JSON.stringify({action,key:snapshotKey,revision:record?.revision??0,...(['save','create'].includes(action)?{draft}:{}),...(action==='review'?{confirmed:true}:{})})});assert.equal(r.status,200,action);record=(await r.json()).record;actions.push(action);
 }
 assert.deepEqual(record.published,draft);let readback=false;
 // Publication invalidation is stale-while-revalidate. Bound readback checks;
 // never repeat mutations or provider fetches to compensate for cached absence.
 for(let attempt=0;attempt<4;attempt++){const r=await fetch(origin+'/api/public/sports/snapshots/nba');if(r.status===200&&isDeepStrictEqual((await r.json()).snapshot,draft)){readback=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.ok(readback,'PUBLIC_READBACK_FAILED');
 const after=await get('/api/owner/sports');assert.deepEqual(before.records.filter(r=>r.key!==snapshotKey),after.records.filter(r=>r.key!==snapshotKey));assert.deepEqual(before.refresh,after.refresh);await paused();if(!production)backup();
 const report={at:new Date().toISOString(),origin,actions,revision:record.revision,sourceDate:draft.observedAt,basis:draft.observationBasis,teams:30,conferences:2,recordReconciliation:30,tiedOrderDifferences:7,officialSeedingVerified:false,publicReadback:true,otherRecordsPreserved:true,newsroomPaused:true,modelCalls:0,sourceRequests:0};
 const dir='output/v3-qa/v35/'+(production?'production':'local');await mkdir(dir,{recursive:true});await writeFile(dir+'/nba-publication.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'logout'})});}
