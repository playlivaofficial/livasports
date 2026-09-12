import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha??''))throw Error('EXACT_RELEASE_COMMIT_REQUIRED');
const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));
const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
async function get(path){const r=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${team}`,{headers:{Authorization:`Bearer ${auth.token}`}});if(!r.ok)throw Error('VERCEL_METADATA_READ_FAILED');return r.json();}
const list=await get(`/v6/deployments?projectId=${project}&limit=10&target=production`);const item=list.deployments.find(d=>d.meta?.githubCommitSha===sha);
if(!item){console.log(JSON.stringify({sha,state:'NOT_LISTED_YET'}));process.exit(0);}
const d=await get(`/v13/deployments/${item.uid}`);
const result={id:d.id,state:d.readyState,sha:d.meta?.githubCommitSha,projectId:d.projectId,target:d.target,url:d.url,aliases:d.alias};
if(result.projectId!==project||result.sha!==sha||result.target!=='production')throw Error('DEPLOYMENT_IDENTITY_MISMATCH');
// Official alias lookup independently verifies which deployment serves the apex.
// https://vercel.com/docs/rest-api/aliases/get-an-alias
const apex=await get(`/v4/aliases/livasports.com?projectId=${project}`);
result.apex={alias:apex.alias,projectId:apex.projectId,deploymentId:apex.deploymentId,matches:apex.projectId===project&&apex.deploymentId===d.id};
await writeFile('output/m7-deployment-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(['ERROR','CANCELED'].includes(result.state))process.exitCode=1;
