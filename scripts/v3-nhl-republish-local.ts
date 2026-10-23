/** Revalidate retained dated evidence, then explicitly publish LOCAL only. No upstream/model requests. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {validateSnapshot,type SportsSnapshot} from '../src/multisport/model';
const base='http://localhost:3351';
const snapshot:SportsSnapshot=JSON.parse(await readFile('output/v3-source-audit/2026-10-21T07-02-42.083Z/nhl-normalized.json','utf8')).snapshot;
const check=JSON.parse(await readFile('output/v3-qa/acceptance-2026-10-21/nhl-division-check.json','utf8'));
assert.equal(snapshot.competitionId,'nhl');assert.equal(snapshot.observedAt,'2026-10-20');
assert.equal(check.source,'https://www.nhl.com/standings/2026-10-20/division');
assert.equal(snapshot.entities.length,32);assert.equal(snapshot.tables.length,4);
let verified=0;
for(const table of snapshot.tables){
 assert.equal(table.type,'ice-hockey');if(table.type!=='ice-hockey')throw Error('TABLE_TYPE');
 for(const row of table.rows){
  const name=snapshot.entities.find(e=>e.id===row.entityId)?.name;
  const officialName=name==='Montreal Canadiens'?'Montréal Canadiens':name;
  const official=check.rows.filter((r:{team:string})=>r.team===officialName);assert.equal(official.length,1);
  const values=official[0].values.map(Number);
  assert.deepEqual([row.rank,row.played,row.wins,row.losses,row.overtimeLosses,row.points,row.goalsFor,row.goalsAgainst],[values[0],values[1],values[2],values[3],values[4],values[5],values[9],values[10]]);
  // Known optional Florida RW conflict: omit the field everywhere, never substitute values.
  delete row.regulationWins;verified++;
 }
}
assert.equal(verified,32);assert.deepEqual(validateSnapshot(snapshot),[]);
const backup=()=>execFileSync('wsl.exe',['-d','Ubuntu','--','bash','scripts/v3-local-postgres.sh','backup'],{windowsHide:true,stdio:'pipe'});
backup();
const key=(await readFile('output/v3-qa/acceptance-2026-10-21/local-owner-key.txt','utf8')).trim();
const headers={'Origin':base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
const login=await fetch(base+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key})});
assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
const ownerHeaders={...headers,Cookie:cookie};
const listing=await fetch(base+'/api/owner/sports',{headers:ownerHeaders});assert.equal(listing.status,200);
const existing=(await listing.json()).records.find((r:{key:string})=>r.key==='nhl:2026/27');
assert.equal(existing,undefined,'Never overwrite an existing snapshot');
let revision=0;
for(const action of ['create','review','publish']){
 const r=await fetch(base+'/api/owner/sports',{method:'POST',headers:ownerHeaders,body:JSON.stringify({action,key:'nhl:2026/27',revision,...(action==='create'?{draft:snapshot}:{}),...(action==='review'?{confirmed:true}:{})})});
 assert.equal(r.status,200,`LOCAL_${action.toUpperCase()}_FAILED`);const data=await r.json();revision=data.record.revision;
 if(action==='publish')assert.deepEqual(data.record.published,snapshot);
}
backup();
const evidence={at:new Date().toISOString(),environment:'isolated-local',restoredHistoricalDatabase:false,newPublication:true,sourceDate:snapshot.observedAt,sourceCheckAt:check.checkedAt,teams:verified,fieldsPerTeam:8,divisionTables:4,liveClaim:false,modelCalls:0,upstreamCalls:0,productionChanges:0};
await writeFile('output/v3-qa/acceptance-2026-10-23/nhl-republication.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
