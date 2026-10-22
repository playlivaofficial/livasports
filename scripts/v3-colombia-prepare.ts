import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeWikimediaBatch} from '../src/multisport/wikimedia';
import {normalizeWikimediaSports} from '../src/multisport/wikimedia-football';
const path='output/v3-source-audit/colombia-recheck/';
const raw=await readFile(path+'revision.json','utf8'),parsed=JSON.parse(raw);
const batch=normalizeWikimediaBatch('colombia-primera-a',parsed,new Date(),createHash('sha256').update(raw).digest('hex'));
const result=normalizeWikimediaSports(batch);assert.equal(result.snapshot.provenance?.[0].revisionId,1381387526);assert.equal(result.snapshot.observedAt,'2026-10-21');
const retained=JSON.parse(await readFile(path+'tables.json','utf8'));
const expected=retained.sources[0].tables.find((t:{rows:string[][];after:string})=>t.rows[0][0]==='Pos'&&t.after.startsWith('Updated to match(es) played on 21 October 2026.')&&t.rows[1][1]==='Deportivo Cali').rows.slice(1);
const table=result.snapshot.tables[0];assert.equal(table.type,'football');if(table.type!=='football')throw Error('TABLE_TYPE');assert.equal(table.rows.length,20);
for(const [i,row]of table.rows.entries()){
 const entity=result.snapshot.entities.find(e=>e.id===row.entityId)!;assert.equal(entity.name,expected[i][1]);
 assert.deepEqual([row.rank,row.played,row.won,row.drawn,row.lost,row.goalsFor,row.goalsAgainst,row.goalDifference,row.points],[expected[i][0],...expected[i].slice(2,10)].map((s:string)=>Number(s.replace('−','-'))));
}
await writeFile(path+'reviewed-snapshot.json',JSON.stringify(result.snapshot,null,2));
await writeFile(path+'prepared.json',JSON.stringify({at:new Date().toISOString(),...result.summary,revision:1381387526,matchedRows:20,published:false},null,2));console.log(JSON.stringify(result.summary));
