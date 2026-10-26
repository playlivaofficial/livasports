/** Offline factual review. Uses an approved CC-BY-SA candidate; no publisher copy or images. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeWikimediaNba} from '../src/multisport/wikimedia-nba';
import {reconcileNba,type IndependentNbaRow} from '../src/multisport/reconcile-nba';
import {validateSnapshot} from '../src/multisport/model';
const root='output/v3-source-audit/2026-10-26T06-31-36.753Z/',out='output/v3-qa/v35/reconciliation/';
const source=await readFile(root+'nba-source.json'),batch=JSON.parse(source.toString()),snapshot=normalizeWikimediaNba(batch);
const facts=JSON.parse(await readFile(out+'nba-independent-facts.json','utf8'));
assert.equal(facts.url,'https://www.cbssports.com/nba/standings/');assert.equal(facts.tables.length,2);
assert.ok(Date.now()-Date.parse(facts.checkedAt)<86400000,'Independent evidence expired');
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const independent:IndependentNbaRow[]=facts.tables.flatMap((rows:{cells:string[];links:{href:string}[]}[],i:number)=>{
 assert.equal(rows.length,15);
 return rows.map(r=>{const slugs=[...new Set(r.links.map(l=>l.href.split('/').at(-2)))],entity=snapshot.entities.find(e=>slugs.some(slug=>norm(slug!)===norm(e.name)));assert.ok(entity);const c=r.cells;return {name:entity.name,conference:i===0?'Eastern':'Western',rank:Number(c[0]),wins:Number(c[2]),losses:Number(c[3]),winPercentage:Number(c[4]),gamesBehind:c[5]==='—'?0:Number(c[5])};});
});
const comparison=reconcileNba(snapshot,independent);assert.equal(comparison.recordsVerified,30);assert.deepEqual(validateSnapshot(snapshot),[]);
const content=JSON.stringify({snapshot},null,2),review={at:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),snapshotSha256:createHash('sha256').update(content).digest('hex'),license:'CC-BY-SA-4.0',independentSource:facts.url,independentCheckedAt:facts.checkedAt,sourceRevisions:snapshot.provenance,resultsCutoffConfirmed:false,comparison};
await writeFile(out+'nba-reviewed.json',content);await writeFile(out+'nba-reviewed-manifest.json',JSON.stringify(review,null,2));
console.log(JSON.stringify({hash:review.snapshotSha256,records:comparison.recordsVerified,tiedOrderingDifferences:comparison.tiedOrderingDifferences,officialSeedingVerified:false,sourceDate:snapshot.observedAt,resultsCutoffConfirmed:false}));
