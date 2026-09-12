// Read-only, sanitized log audit using the request-logs endpoint used by Vercel CLI.
// https://github.com/vercel/vercel/blob/main/packages/cli/src/util/logs-v2.ts
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const deploymentId=process.argv[2];if(!/^dpl_[a-zA-Z0-9]+$/.test(deploymentId??''))throw Error('DEPLOYMENT_REQUIRED');
const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
try{const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));let rows=[],hasMore=false;
  for(let page=0;page<10;page++){
    const q=new URLSearchParams({projectId:project,ownerId:team,teamId:team,deploymentId,environment:'production',startDate:String(Date.now()-3600000),endDate:String(Date.now()+60000),page:String(page)});
    const r=await fetch('https://vercel.com/api/logs/request-logs?'+q,{headers:{Authorization:`Bearer ${auth.token}`}});if(!r.ok)throw Error('LOGS_UNAVAILABLE');const body=await r.json();rows.push(...(body.rows??[]));hasMore=body.hasMoreRows===true;if(!hasMore)break;
  }
  const failures=rows.filter(r=>r.statusCode>=500||r.logs?.some(l=>['error','fatal'].includes(l.level))),classes={};
  for(const r of failures){const key=r.logs?.some(l=>/destination stream closed early/i.test(l.message??''))?'CLIENT_STREAM_CLOSED':r.logs?.some(l=>/CONFIG_READ_FAILED|redirect-config-failed|attribution-write-failed/i.test(l.message??''))?'COMMERCIAL_ERROR':'OTHER_ERROR';classes[key]=(classes[key]??0)+1;}
  const result={at:new Date().toISOString(),deploymentId,status:failures.length?'REVIEW':rows.length?'PASS':'NO_LOG_ROWS',rows:rows.length,hasMore,server5xx:rows.filter(r=>r.statusCode>=500).length,errorRows:failures.length,errorClasses:classes,providerRequestMarkers:rows.reduce((n,r)=>n+(r.logs??[]).filter(l=>/providerRequests["\s:]+[1-9]/.test(l.message??'')).length,0)};
  await writeFile('output/m8-production-runtime-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.server5xx||result.providerRequestMarkers||classes.COMMERCIAL_ERROR||classes.OTHER_ERROR)process.exitCode=1;
}catch{console.error('M8_RUNTIME_LOG_AUDIT_FAILED; no private log bodies printed');process.exitCode=1;}
