// Explicit reviewed manual updates, never a source scheduler or unbounded import.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
assert.ok(process.argv.slice(2).every(x=>['--production','--publish-reviewed','--nfl','--nhl'].includes(x)));
assert.ok(process.argv.includes('--publish-reviewed'));
assert.equal(process.argv.filter(x=>['--nfl','--nhl'].includes(x)).length,1);
const id=process.argv.includes('--nfl')?'nfl':'nhl',production=process.argv.includes('--production');
const origin=production?'https://livasports.com':'http://localhost:3351';
const hashes={nfl:'9e6cefa5dbc699c56a1543f08eee305e662be48ad08e9116eb0e075c0909472e',nhl:'e46a3e11628352c22126946536b03537e4a016ea78f5a7ca65b09bbf9c81dd09'};
const content=await readFile(`output/v3-qa/v34/${id}-reviewed.json`);
assert.equal(createHash('sha256').update(content).digest('hex'),hashes[id]);
const draft=JSON.parse(content).snapshot;assert.equal(draft.competitionId,id);assert.equal(draft.mode,'manual');
const privateText=await readFile(production?'../../output/hardening-owner-permanent-key.txt':'output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8');
const key=production?privateText.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim():privateText.trim();assert.ok(key);
const headers={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const login=await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
try{
 const get=async path=>{const r=await fetch(origin+path,{headers});assert.equal(r.status,200);return r.json();};
 const paused=async()=>assert.equal((await get('/api/owner/news/automation')).paused,true);
 await paused();const before=await get('/api/owner/sports');const snapshotKey=id+':'+draft.season;
 let record=before.records.find(r=>r.key===snapshotKey);assert.ok(record?.published,'This update must preserve an existing publication');assert.equal(record.archived,false);
 assert.ok(Date.parse(draft.observedAt)>=Date.parse(record.published.observedAt),'Do not regress the published source date');
 const backup=()=>assert.equal(spawnSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{stdio:'ignore',windowsHide:true,timeout:60000}).status,0);
 if(!production)backup();const actions=[];
 if(!isDeepStrictEqual(record.published,draft)){
  for(const action of ['save','review','publish']){
   const r=await fetch(origin+'/api/owner/sports',{method:'POST',headers,body:JSON.stringify({action,key:snapshotKey,revision:record.revision,...(action==='save'?{draft}:{}),...(action==='review'?{confirmed:true}:{})})});
   assert.equal(r.status,200,action);record=(await r.json()).record;actions.push(action);
  }
 }
 assert.deepEqual(record.published,draft);
 let found=false;
 for(let attempt=0;attempt<4;attempt++){const r=await fetch(origin+'/api/public/sports/snapshots/'+id);assert.equal(r.status,200);const b=await r.json();if(isDeepStrictEqual(b.snapshot,draft)){found=true;break;}await new Promise(r=>setTimeout(r,1000));}
 assert.ok(found,'Public readback must match reviewed snapshot');const after=await get('/api/owner/sports');
 assert.deepEqual(before.records.filter(r=>r.key!==snapshotKey),after.records.filter(r=>r.key!==snapshotKey));assert.deepEqual(before.refresh,after.refresh);await paused();if(!production)backup();
 const result={at:new Date().toISOString(),origin,id,actions,revision:record.revision,observedAt:draft.observedAt,observationBasis:draft.observationBasis,rows:32,excludedFields:id==='nhl'?['regulationWins']:[],publicReadback:true,otherRecordsPreserved:true,paused:true,paidModelCalls:0,externalSourceRequests:0};
 const dir=`output/v3-qa/v34/${production?'production':'local'}`;await mkdir(dir,{recursive:true});await writeFile(`${dir}/${id}-publication.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'logout'})});}
