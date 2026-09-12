import {writeFile} from 'node:fs/promises';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const invoke=process.argv.includes('--invoke');
const headers={Authorization:`Bearer ${process.env.CRON_SECRET}`};
const checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
const check=(name:string,pass:boolean,detail?:unknown)=>{checks.push({name,pass,detail});if(!pass)process.exitCode=1;};
async function get(path:string,authenticated=false,method='GET'){
  const response=await fetch(base+path,{method,headers:authenticated?headers:{},cache:'no-store',signal:AbortSignal.timeout(175000)});
  return {status:response.status,body:await response.json()};
}
try{
  check('refresh rejects unauthenticated', (await get('/api/internal/odds-refresh',false,'POST')).status===401);
  check('health rejects unauthenticated',(await get('/api/internal/odds-health')).status===401);
  const before=await get('/api/internal/odds-health',true);check('authenticated health available',before.status===200);
  if(before.status!==200)throw new Error('HEALTH_GATE_FAILED');
  check('automation honestly disabled',before.body.automationEnabled===false&&before.body.automationOperational===false&&before.body.lastSuccessfulAutomatedRefreshAt===null);
  check('automatic trigger disabled',(await get('/api/internal/odds-refresh',true)).status===503);
  check('user query cannot select paid targets',(await get('/api/internal/odds-refresh?bookmaker=betsson',true,'POST')).status===400);
  let run:unknown=null;
  if(invoke){
    const response=await get('/api/internal/odds-refresh',true,'POST');run=response.body;
    check('bounded controlled refresh',response.status===200&&response.body.state==='SUCCEEDED'&&response.body.requests<=4,response.body);
    if(response.status!==200||response.body.state!=='SUCCEEDED')throw new Error('REFRESH_GATE_FAILED');
    const replay=await get('/api/internal/odds-refresh',true,'POST');
    check('immediate duplicate invocation costs zero requests',replay.status===200&&replay.body.requests===0,replay.body);
  }
  const after=await get('/api/internal/odds-health',true);
  check('no active lease',after.body.activeLease===null);
  check('manual proof is not mislabeled automation',after.body.automationOperational===false&&after.body.lastSuccessfulAutomatedRefreshAt===null);
  const json=JSON.stringify(after.body);check('secret absent from health',!process.env.CRON_SECRET||!json.includes(process.env.CRON_SECRET));
  const result={at:new Date().toISOString(),base,invoke,status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,run,health:after.body};
  await writeFile(`output/m5-1-${base.startsWith('https')?'production':'local'}-http-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch{console.error('M5_1_HTTP_QA_FAILED');process.exitCode=1;}
