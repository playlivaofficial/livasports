/** Offline preparation only: licensed candidate facts plus exact independent field reconciliation. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateSnapshot,type SportsSnapshot} from '../src/multisport/model';
const root='output/v3-source-audit/2026-10-26T06-31-36.753Z/';
const nfl=JSON.parse(await readFile('output/v3-qa/v34/source-reconciliation.json','utf8')).find((r:{id:string})=>r.id==='nfl');
const nhl=JSON.parse(await readFile('output/v3-qa/v34/nhl-comparison.json','utf8'));
const reviewed=[];
for(const id of ['nfl','nhl']){
 const input=await readFile(root+id+'-normalized.json','utf8');const snapshot=JSON.parse(input).snapshot as SportsSnapshot;
 const comparison=id==='nfl'?nfl:nhl;
 assert.equal(comparison.comparisons.length,32);
 if(id==='nfl')assert.ok(comparison.comparisons.every((r:{match:boolean})=>r.match));
 else{
  const mismatches=comparison.comparisons.filter((r:{match:boolean})=>!r.match);
  assert.equal(mismatches.length,1);assert.equal(mismatches[0].name,'New Jersey Devils');
  assert.deepEqual(mismatches[0].differences,[{field:'regulationWins',candidate:4,official:5}]);
  // Do not pick either disputed number or turn absence into zero. Exclude this optional field uniformly.
  for(const table of snapshot.tables)if(table.type==='ice-hockey')for(const row of table.rows)delete row.regulationWins;
 }
 assert.equal(snapshot.entities.length,32);assert.deepEqual(validateSnapshot(snapshot),[]);
 const content=JSON.stringify({snapshot},null,2);await writeFile('output/v3-qa/v34/'+id+'-reviewed.json',content);
 const source=await readFile(root+id+'-source.json');
 reviewed.push({id,sourceSha256:createHash('sha256').update(source).digest('hex'),snapshotSha256:createHash('sha256').update(content).digest('hex'),sourceUrl:snapshot.sourceUrl,observedAt:snapshot.observedAt,basis:snapshot.observationBasis,rows:32,license:'CC-BY-SA-4.0',independentSource:id==='nfl'?nfl.url:nhl.source,excludedFields:id==='nhl'?['regulationWins']:[],automatic:false});
}
await writeFile('output/v3-qa/v34/reviewed-manifest.json',JSON.stringify(reviewed,null,2));console.log(JSON.stringify(reviewed));
