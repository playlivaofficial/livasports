// Read-only release metadata. Never print tokens, environment values or destinations.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8'));
const team='team_rtsOqa3gRkQZwndpkXwyMDno', project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr';
async function get(path){const r=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${team}`,{headers:{Authorization:`Bearer ${auth.token}`}});if(!r.ok)return {status:r.status};return r.json();}
const p=await get(`/v9/projects/${project}`);
console.log(JSON.stringify({project:{id:p.id,name:p.name,accountId:p.accountId,link:p.link?{type:p.link.type,org:p.link.org,repo:p.link.repo}:null,status:p.status}}));
const e=await get(`/v10/projects/${project}/env`);
console.log(JSON.stringify({environmentNames:e.envs?.map(x=>({key:x.key,target:x.target,type:x.type})),status:e.status}));
const d=await get(`/v6/deployments?projectId=${project}&limit=3&target=production`);
console.log(JSON.stringify({deployments:d.deployments?.map(x=>({uid:x.uid,readyState:x.readyState,url:x.url,sha:x.meta?.githubCommitSha,created:x.created})),status:d.status}));
