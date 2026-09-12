import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const db=new PostgresDatabaseClient(databaseUrl()!);
const results:Array<{path:string;pass:boolean;status:number;kind:string}>=[];
async function counters(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,
  (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+
  (SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports`)).rows[0];}
try{
  const before=await counters();
  const match='/br/jogo/atletico-mineiro-x-fluminense-efb9eb4236e54aa8';
  for(const [path,kind] of [[match,'initial'],[match,'repeat'],[match,'Googlebot'],[match,'mobile'],
    ['/api/odds/efb9eb42-36e5-4aa8-9b0d-05cbe62b9dd3?locale=br','odds-tab'],
    ['/mx/partido/atletico-mineiro-x-fluminense-efb9eb4236e54aa8','locale-switch'],
    ['/br/time/flamengo-b9c4f07b09aa447a','team'],['/br/jogador/agustin-rossi-27e4e63b6336469b','player']]){
    const response=await fetch(base+path,{headers:{'User-Agent':kind==='Googlebot'?'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)':kind==='mobile'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile':'LivaSports-M5.1-QA'},signal:AbortSignal.timeout(30000)});
    const body=await response.text();results.push({path,kind,status:response.status,pass:response.status===200&&
      (kind==='odds-tab'?JSON.parse(body).providerRequests===0:body.includes('LivaSports')&&!body.includes('href="/go/'))});
  }
  const after=await counters();const zeroProviderDelta=JSON.stringify(before)===JSON.stringify(after);
  const result={at:new Date().toISOString(),base,pass:results.every(r=>r.pass)&&zeroProviderDelta,results,before,after,zeroProviderDelta};
  await writeFile(`output/m5-1-${base.startsWith('https')?'production':'local'}-navigation-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
  if(!result.pass)process.exitCode=1;
}catch{console.error('M5_1_NAVIGATION_QA_FAILED');process.exitCode=1;}finally{await db.close();}
