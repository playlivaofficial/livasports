// Reconcile retained public evidence only. No network or publication side effects.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const path='output/v3-source-audit/colombia-recheck/';
const evidence=JSON.parse(await readFile(path+'tables.json','utf8'));
const community=evidence.sources.find(s=>s.id==='community');
const table=community.tables.find(t=>t.rows[0][0]==='Pos'&&t.after.startsWith('Updated to match(es) played on 21 October 2026.')&&t.rows[1][1]==='Deportivo Cali');
assert.ok(table);const a=table.rows.slice(1),b=evidence.sources.find(s=>s.id==='official').tables[0].rows.slice(1);
assert.equal(a.length,20);assert.equal(b.length,20);
const aliases={'Millonarios':'Millonarios F.C.','Santa Fe':'Independiente Santa Fe','Once Caldas':'Once Caldas DAF','Llaneros':'Llaneros F.C.','Alianza':'Alianza Valledupar F.C.','Junior':'Junior F.C.','Boyacá Chicó':'Boyacá Chicó F.C.','Jaguares':'Jaguares F.C.'};
const numeric=s=>Number(s.replace('−','-'));
for(let i=0;i<a.length;i++){
 assert.equal(aliases[a[i][1]]??a[i][1],b[i][1]);
 assert.deepEqual([a[i][0],...a[i].slice(2,10)].map(numeric),[b[i][0],...b[i].slice(3,10),b[i][2]].map(numeric));
 const [played,won,drawn,lost,gf,ga,gd,points]=a[i].slice(2,10).map(numeric);
 assert.equal(played,won+drawn+lost);assert.equal(gd,gf-ga);assert.equal(points,won*3+drawn);
}
const totals=a.reduce((acc,row)=>acc.map((v,i)=>v+numeric(row[i+2])),Array(8).fill(0));
assert.equal(totals[1],totals[3]);assert.equal(totals[4],totals[5]);assert.equal(totals[2]%2,0);
const result={checkedAt:evidence.checkedAt,competition:'Colombia Primera A',stage:'Finalización',dataAsOf:'2026-10-21',rows:20,matchingNumericFields:180,aggregateGoalsFor:totals[4],aggregateGoalsAgainst:totals[5],published:false,publicationBlocker:'Requires revision-bound approved importer/provenance and normal snapshot review; this reconciliation is not an automatic publishing permission.',requests:0,modelCalls:0};
await writeFile(path+'reconciliation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
