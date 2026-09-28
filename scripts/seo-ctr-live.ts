/** Scoped operational helper. Credential values never leave this process or reach output files. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {gscCredential,gscProperty} from '../src/seo/gsc';
import {accessTokenFor,searchAnalytics} from '../src/seo/gsc-client';
import {gscWindows} from '../src/seo/gsc-ingest';

const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
async function main(){
  const auth=JSON.parse(await readFile(join(process.env.APPDATA!,'com.vercel.cli','Data','auth.json'),'utf8')) as {token?:string};
  if(!auth.token)throw Error('VERCEL_SESSION_MISSING');
  const get=async(path:string)=>{
    const res=await fetch(`https://api.vercel.com${path}${path.includes('?')?'&':'?'}teamId=${team}`,{headers:{authorization:`Bearer ${auth.token}`}});
    if(!res.ok)throw Error(`VERCEL_HTTP_${res.status}`);
    return res.json();
  };
  const catalog=await get(`/v10/projects/${project}/env?decrypt=false`);
  const entries=(catalog.envs as Array<{id:string;key:string;target:string[]}>).map(({id,key,target})=>({id,key,target}));
  const read=async(key:string)=>{
    if(!['CRON_SECRET','GSC_SERVICE_ACCOUNT_JSON','GSC_REFRESH_TOKEN','GSC_CLIENT_ID','GSC_CLIENT_SECRET','GSC_PROPERTY'].includes(key))throw Error('UNAPPROVED_SECRET');
    const entry=entries.find(e=>e.key===key&&e.target.includes('production'));
    if(!entry)return undefined;
    const result=await get(`/v1/projects/${project}/env/${entry.id}`);
    if(typeof result.value!=='string')throw Error('VALUE_UNAVAILABLE');
    return result.value as string;
  };
  if(process.argv.includes('--refresh')){
    const secret=await read('CRON_SECRET');if(!secret)throw Error('CRON_NOT_CONFIGURED');
    const result=await fetch('https://livasports.com/api/internal/seo-refresh',{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(150_000)});
    if(!result.ok)throw Error(`SEO_REFRESH_HTTP_${result.status}`);
    const body=await result.json();
    console.log(JSON.stringify({http:result.status,state:body.state,providerRequests:body.providerRequests,gscState:body.gsc?.state,rows:body.gsc?.rows,days:body.gsc?.days}));
  }
  if(process.argv.includes('--gsc-read')){
    const env:Record<string,string|undefined>={GSC_PROPERTY:await read('GSC_PROPERTY')};
    if(entries.some(e=>e.key==='GSC_SERVICE_ACCOUNT_JSON'&&e.target.includes('production')))env.GSC_SERVICE_ACCOUNT_JSON=await read('GSC_SERVICE_ACCOUNT_JSON');
    else for(const name of ['GSC_REFRESH_TOKEN','GSC_CLIENT_ID','GSC_CLIENT_SECRET'])env[name]=await read(name);
    const credential=gscCredential(env);if(!credential)throw Error('GSC_NOT_CONFIGURED');
    const token=await accessTokenFor(credential),property=gscProperty(env),windows=gscWindows();
    const reports=[];
    for(const dimension of ['page','query','country','device']){
      const dimensions=dimension==='page'?['date','page']:['date','page',dimension];
      const result=await searchAnalytics(token,property,{startDate:windows.current28.from,endDate:windows.current28.to,dimensions});
      reports.push({dimension,dimensions,...result});
    }
    await mkdir('output/seo-ctr',{recursive:true});
    const path='output/seo-ctr/gsc-joined-before.json';
    await writeFile(path,JSON.stringify({capturedAt:new Date().toISOString(),property,windows,reports},null,2));
    console.log(JSON.stringify({path,reports:reports.map(({dimension,rows,truncated})=>({dimension,rows:rows.length,truncated}))}));
  }
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_0-9]+$/.test(error.message)?error.message:'SCOPED_VERIFICATION_FAILED'}));process.exitCode=1;});
