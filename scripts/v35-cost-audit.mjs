// Read-only meters through the existing official CLI sessions. Never persist raw account responses.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const vercel=process.env.V35_VERCEL_CLI,neon=process.env.V35_NEON_CLI;
if(!vercel||!neon)throw Error('OFFICIAL_CLI_PATHS_REQUIRED');
const scope='nikapopkha3-4447s-projects',team='team_rtsOqa3gRkQZwndpkXwyMDno',org='org-muddy-forest-43427042';
const dir='output/v3-qa/v35/costs';await mkdir(dir,{recursive:true});
function call(cli,args){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',windowsHide:true,timeout:55000,maxBuffer:8_000_000});if(r.status!==0)return {unavailable:true,exit:r.status};try{return JSON.parse(r.stdout);}catch{return {unavailable:true,reason:'NOT_JSON'};}}
const report={at:new Date().toISOString(),readOnly:true,billingChanges:0,periods:[],limitations:['Usage meters are not settled invoices. No incremental V3.5 dollar saving can be attributed before an equivalent post-release window.']};
// Vercel charge buckets use midnight Los Angeles (07:00 UTC here). Leave a full
// reporting day behind us. Neon daily buckets use UTC; label them separately.
for(const [name,since,until] of [['complete24h','2026-10-24T07:00:00Z','2026-10-25T07:00:00Z'],['complete7d','2026-10-18T07:00:00Z','2026-10-25T07:00:00Z']]){
 const r=call(vercel,['usage','--scope',scope,'--group-by','project','--since',since,'--until',until,'--json']);
 const items=Array.isArray(r.groupBy?.data)?r.groupBy.data:[];
 const projects=items.map(p=>({id:p.id??p.projectId,name:p.name,cost:p.totals?.cost,services:p.services?.map(s=>({name:s.name,quantity:s.quantity,unit:s.unit,cost:s.cost,included:s.included}))}));
 // Schema-only diagnostics contain no credentials, account names, payment data or billing addresses.
 const neonSince=since.replace('07:00','00:00'),neonUntil=until.replace('07:00','00:00');
 report.periods.push({name,since,until,vercel:{period:r.period,projects,unavailable:r.unavailable??false,schema:projects.length?undefined:Object.keys(r)},neonPeriod:{since:neonSince,until:neonUntil},neon:call(neon,['api','/consumption_history/v2/projects','-Q','org_id='+org,'-Q','from='+neonSince,'-Q','to='+neonUntil,'-Q','granularity=daily','-Q','limit=100','-Q','metrics=compute_unit_seconds,root_branch_bytes_month,child_branch_bytes_month,instant_restore_bytes_month,public_network_transfer_bytes,private_network_transfer_bytes,snapshot_storage_bytes_month'])});
}
const t=call(vercel,['api','/v2/teams/'+team,'--scope',scope]);
report.vercelAccount={plan:t.billing?.plan,status:t.billing?.status,period:t.billing?.period,trial:t.billing?.trial,availableCredits:t.billing?.credits??null,billingSchema:Object.keys(t.billing??{}),invoiceVerified:false};
const n=call(neon,['api','/organizations/'+org]);report.neonAccount={plan:n.organization?.plan??n.plan??null,schema:Object.keys(n),invoiceVerified:false};
await writeFile(dir+'/baseline.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({file:dir+'/baseline.json',periods:report.periods.map(p=>({name:p.name,projects:p.vercel.projects.map(x=>({name:x.name,cost:x.cost})),vercelSchema:p.vercel.schema,neonSchema:Object.keys(p.neon)})),vercelAccount:report.vercelAccount,neonAccount:report.neonAccount}));
