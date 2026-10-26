/** Read-only LivaSports aggregates. Never retain client identifiers or raw logs. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const cli=process.env.V35_VERCEL_CLI;assert.ok(cli,'EXISTING_CLI_REQUIRED');
const report={at:new Date().toISOString(),productionChanges:0,queries:[]};
for(const [name,metric,groups,filter] of [
 ['archivePaths','vercel.isr_operation.write_units',['requestPath'],'route:"/mx/jugador/[profile]"'],
 ['archiveBots','vercel.isr_operation.write_units',['botName','botVerified'],undefined],
 ['archiveActions','vercel.isr_operation.write_units',['isrAction','cacheResult'],undefined],
 ['archiveMethods','vercel.isr_operation.write_units',['requestMethod','contentType'],undefined],
 ['archiveRedirects','vercel.request.count',['requestPath','redirectLocation'],'route:"/mx/jugador/[profile]" AND httpStatus:308'],
]){
 const args=[cli,'metrics',metric,'--scope','nikapopkha3-4447s-projects','--project','livasports','--prod','--since','2026-10-25T07:00:00Z','--until','2026-10-26T07:00:00Z','--aggregation',metric==='vercel.request.count'?'count':'sum','--order-by','value','--limit','20','--granularity','1h','--json'];
 for(const group of groups)args.push('--group-by',group);if(filter)args.push('--filter',filter);
 const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8000000});
 if(result.status!==0){report.queries.push({name,unavailable:true});continue;}
 const parsed=JSON.parse(result.stdout),summary=parsed.summary??[];
 for(const row of summary)for(const key of ['requestPath','redirectLocation'])if(key in row){
  const value=String(row[key]).split('?')[0];row[key]=/^(https:\/\/livasports\.com)?\/(mx|co|pe|br|en)\/[a-z]+\/[a-z0-9-]+$/i.test(value)?value:'[non-public-path-omitted]';
 }
 const entry={name,query:parsed.query,summary};report.queries.push(entry);console.log(JSON.stringify(entry));
}
await mkdir('output/v3-qa/v35/costs',{recursive:true});
await writeFile('output/v3-qa/v35/costs/archive-investigation.json',JSON.stringify(report,null,2));
