/** Four fixed public CC0 requests, no credentials, publication or arbitrary URL input. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {OPENFOOTBALL_ARCHIVES,normalizeOpenFootballArchive} from '../src/multisport/openfootball';
import {validateSnapshot} from '../src/multisport/model';
const dir='output/v3-qa/v32/source-review';await mkdir(dir,{recursive:true});
const reports=[];
for(const config of OPENFOOTBALL_ARCHIVES){
 const response=await fetch(config.sourceUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
 const raw=await response.text();assert.ok(Buffer.byteLength(raw)<1048576);const input=JSON.parse(raw),hash=createHash('sha256').update(raw).digest('hex');
 const {snapshot,summary}=normalizeOpenFootballArchive(config.competitionId,input,new Date(),hash);assert.deepEqual(validateSnapshot(snapshot),[]);
 // Independently reconcile every normalized result to source names, dates, scores and round.
 let fields=0;for(const event of snapshot.events){const home=snapshot.entities.find(e=>e.id===event.homeId)!.name,away=snapshot.entities.find(e=>e.id===event.awayId)!.name;
  const source=input.matches.filter((m:{team1:string;team2:string;date:string})=>m.team1===home&&m.team2===away&&m.date===event.date);assert.equal(source.length,1);
  assert.deepEqual(Array.isArray(source[0].score)?source[0].score:source[0].score.ft,[event.scores!.home,event.scores!.away]);assert.equal(source[0].round,event.round);assert.equal(event.start,null);fields+=6;
 }
 assert.equal(snapshot.entities.length,config.maxTeams);assert.equal(snapshot.tables.length,0);assert.equal(snapshot.mode,'historical');
 await writeFile(`${dir}/${config.competitionId}-source.json`,raw);await writeFile(`${dir}/${config.competitionId}-snapshot.json`,JSON.stringify(snapshot,null,2));reports.push({...summary,reconciledFields:fields,verification:'Exact upstream archive reconciliation; not independent official results verification',publicationApproved:false});
}
await writeFile(dir+'/review.json',JSON.stringify({at:new Date().toISOString(),requests:4,reports},null,2));console.log(JSON.stringify(reports));
