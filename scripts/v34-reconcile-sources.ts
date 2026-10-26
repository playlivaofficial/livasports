/** Bounded read-only reconciliation. Never publishes, grants rights, or calls a paid API. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {load} from 'cheerio';
import {normalizeWikimediaSports} from '../src/multisport/wikimedia-football';
const root=process.argv[2];
if(!root||!/^output[\\/]v3-source-audit[\\/][0-9TZ.:-]+$/.test(root))throw Error('AUDIT_DIRECTORY_REQUIRED');
const out='output/v3-qa/v34';await mkdir(out,{recursive:true});
const reports:unknown[]=[];
const candidates=async(id:string)=>JSON.parse(await readFile(join(root,id+'-normalized.json'),'utf8')).snapshot;
const urls={nfl:'https://www.nfl.com/standings/league/2026/reg',nba:'https://www.nba.com/standings',nhl:'https://www.nhl.com/standings/2026-10-25'};
for(const [id,url] of Object.entries(urls)){
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok){reports.push({id,url,http:res.status,status:'UNAVAILABLE'});continue;}
  const html=await res.text();if(html.length>5000000)throw Error('SOURCE_TOO_LARGE');
  const $=load(html),snapshot=await candidates(id),comparisons=[];
  if(id==='nfl'){
   for(const entity of snapshot.entities){const row=snapshot.tables.flatMap((t:{rows:unknown[]})=>t.rows).find((r:{entityId:string})=>r.entityId===entity.id);const source=$('table tbody tr').toArray().filter(r=>$(r).text().includes(entity.name));
    if(source.length!==1){comparisons.push({name:entity.name,match:false,error:'IDENTITY'});continue;}
    const actual=$(source[0]).find('td').map((_,x)=>$(x).text().trim()).get().slice(1,7).map(Number);
    const expected=[row.wins,row.losses,row.ties,row.winPercentage,row.pointsFor,row.pointsAgainst];
    const differences=expected.flatMap((v:number,i:number)=>Math.abs(v-actual[i])>(i===3?.00051:0)?[{field:['W','L','T','PCT','PF','PA'][i],candidate:v,official:actual[i]}]:[]);
    comparisons.push({name:entity.name,match:actual.length===6&&!differences.length,differences});
   }
  }
  reports.push({id,url,http:res.status,checkedAt:new Date().toISOString(),candidateSourceDate:snapshot.observedAt,observationBasis:snapshot.observationBasis,tableCount:$('table').length,structuredScriptIds:$('script[id]').map((_,e)=>$(e).attr('id')).get(),comparisons,status:comparisons.length===snapshot.entities.length&&comparisons.every(r=>r.match)?'RECONCILED':'REVIEW_REQUIRED'});
 }catch{reports.push({id,url,status:'SOURCE_CHECK_FAILED'});}
}
// Reuse the already collected source; no additional Wikipedia call.
try{const batch=JSON.parse(await readFile(join(root,'colombia-primera-a-source.json'),'utf8'));const result=normalizeWikimediaSports(batch,new Date());await writeFile(join(root,'colombia-primera-a-normalized.json'),JSON.stringify(result,null,2));reports.push({id:'colombia-primera-a',status:'PARSED_NOT_FACT_CHECKED',date:result.snapshot.observedAt,rows:result.snapshot.entities.length});}catch(error){reports.push({id:'colombia-primera-a',status:'REJECTED',error:error instanceof Error?error.message:'NORMALIZATION_ERROR'});}
await writeFile(out+'/source-reconciliation.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports));
