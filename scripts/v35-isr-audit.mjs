/** Read-only, project-scoped aggregate metrics. No log bodies, headers, IPs or credentials. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const cli=process.env.V35_VERCEL_CLI;assert.ok(cli,'EXISTING_OFFICIAL_CLI_REQUIRED');
const periods={week:['2026-10-18T07:00:00Z','2026-10-25T07:00:00Z'],previousDay:['2026-10-24T07:00:00Z','2026-10-25T07:00:00Z'],latestDay:['2026-10-25T07:00:00Z','2026-10-26T07:00:00Z']};
const report={at:new Date().toISOString(),readOnly:true,project:'livasports',configurationChanges:0,queries:[],limitations:['ISR units are 8 KB units, not request counts. Metrics may align requested time bounds to larger buckets; actual query bounds are retained. No matched post-fix dollar saving is inferred.']};
function query(name,metric,period,groupBy,{aggregation='sum',filter}={}){
 const [since,until]=periods[period],args=[cli,'metrics','query',metric,'--scope','nikapopkha3-4447s-projects','--project','livasports','--since',since,'--until',until,'--aggregation',aggregation,'--order-by','value','--limit','30','--granularity','1h','--json'];
 for(const key of groupBy)args.push('--group-by',key);if(filter)args.push('--filter',filter);
 const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:55000,maxBuffer:8_000_000});
 if(r.status!==0){report.queries.push({name,unavailable:true});return;}
 const parsed=JSON.parse(r.stdout),summary=parsed.summary??[];
 // This sole path query targets a public legacy player route. Do not retain query strings.
 if(groupBy.includes('requestPath'))for(const row of summary){const path=String(row.requestPath??'').split('?')[0];row.requestPath=/^\/mx\/jugador\/[a-z0-9-]+$/i.test(path)?path:'[non-public-path-omitted]';}
 const value={name,requested:{since,until},query:parsed.query,summary};report.queries.push(value);
 console.log(JSON.stringify(value));
}
query('weekWriteRoutes','vercel.isr_operation.write_units','week',['route','environment']);
query('previousDayWriteRoutes','vercel.isr_operation.write_units','previousDay',['route']);
query('latestDayWriteRoutes','vercel.isr_operation.write_units','latestDay',['route']);
query('latestDayStatus','vercel.isr_operation.write_units','latestDay',['httpStatus']);
query('latestDayCacheTags','vercel.isr_operation.write_units','latestDay',['cacheTags']);
query('latestDayDeployments','vercel.isr_operation.write_units','latestDay',['deploymentId']);
query('latestDayPlayerTraffic','vercel.request.count','latestDay',['requestPath'],{aggregation:'count',filter:'route:"/mx/jugador/[profile]"'});
query('latestDayInvocationRoutes','vercel.function_invocation.count','latestDay',['route'],{aggregation:'count'});
await mkdir('output/v3-qa/v35/costs',{recursive:true});await writeFile('output/v3-qa/v35/costs/isr-attribution.json',JSON.stringify(report,null,2));
