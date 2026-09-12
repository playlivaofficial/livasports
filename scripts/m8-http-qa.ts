import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const db=new PostgresDatabaseClient(databaseUrl()!),checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
function check(name:string,pass:boolean,detail?:unknown){checks.push({name,pass,detail});if(!pass)process.exitCode=1;}
async function counts(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports,(SELECT count(*) FROM affiliate_clicks) AS clicks,(SELECT count(*) FROM affiliate_impressions) AS impressions,(SELECT count(*) FROM affiliate_conversion_events) AS conversions`)).rows[0];}
try{
  const before=await counts();const durations=[];
  for(const path of ['/go/betsson/slip_bookmaker_comparison?offer=invalid','/go/betsson/match_odds_table?offer=invalid&url=https://evil.invalid','/go/betsson/mobile_inline?destination=javascript%3Aalert(1)','/go/betsson/mobile_inline?offer=invalid&campaignId=override','/go/betsson/mobile_inline?offer=invalid&offer=duplicate','/go/betano.bet.br/mobile_inline?offer=invalid','/go/unknown/mobile_inline?offer=invalid','/go/betsson/unknown?offer=invalid','/go/betsson/mobile_inline?offer=invalid&url=%2F%2Fevil.invalid','/go/betsson/mobile_inline?offer=invalid&clickId=not-a-uuid']){
    const start=performance.now();const r=await fetch(base+path,{redirect:'manual',headers:{'x-livasports-qa':'1'}});durations.push(performance.now()-start);
    check('unsafe combination rejected '+path.split('?')[0],r.status>=400&&r.status<500&&!r.headers.get('location')&&r.headers.get('x-robots-tag')?.includes('noindex')===true,{status:r.status});
  }
  const head=await fetch(base+'/go/betsson/mobile_inline?offer=invalid',{method:'HEAD'});check('HEAD never activates',head.status===204);
  const bot=await fetch(base+'/go/betsson/mobile_inline?offer=invalid',{headers:{'user-agent':'Googlebot'}});check('crawler never activates',bot.status===204);
  const prefetch=await fetch(base+'/go/betsson/mobile_inline?offer=invalid',{headers:{purpose:'prefetch'}});check('prefetch never activates',prefetch.status===204);
  const post=(path:string,body:unknown,origin=base)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,'x-livasports-qa':'1'},body:JSON.stringify(body)});
  for(const locale of ['br','mx']){const r=await post('/api/commercial/offers',[{locale,pagePath:'/'+locale,placement:'mobile_inline'}]);const body=await r.json();check(locale+' missing campaign remains hidden',r.status===200&&body.offers.length===1&&body.offers[0]===null&&body.providerRequests===0);}
  for(const body of [[],Array(17).fill({locale:'br',pagePath:'/br',placement:'mobile_inline'}),[{locale:'br',pagePath:'/br',placement:'mobile_inline',destination:'https://evil.invalid'}]])check('invalid/oversized commercial context rejected',(await post('/api/commercial/offers',body)).status===400);
  check('cross-origin offer denied',(await post('/api/commercial/offers',[{locale:'br',pagePath:'/br',placement:'mobile_inline'}],'https://evil.invalid')).status===403);
  check('forged impression rejected',(await post('/api/events',{eventId:crypto.randomUUID(),eventName:'affiliate_impression',offer:'invalid',qa:true})).status===400);
  for(const method of ['GET','POST']){const r=await fetch(base+'/api/affiliate/postback/betsson',{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({event:'FTD',clickId:crypto.randomUUID(),amount:100})}:{})});check('unsupported '+method+' postback disabled',r.status===404);}
  for(const headers of [{},{Authorization:'Bearer invalid'}])check('masked operations requires authorization',(await fetch(base+'/api/internal/affiliate-health',{headers})).status===401);
  const after=await counts();check('QA creates no fake live events or provider calls',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const sorted=durations.sort((a,b)=>a-b);const result={at:new Date().toISOString(),base,status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,rejectedRedirectLatencyMs:{p50:Math.round(sorted[Math.floor(sorted.length*.5)]),max:Math.round(sorted.at(-1)!)},providerRequests:0};
  await writeFile(`output/m8-${base.startsWith('https')?'production':'local'}-http-private.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch{console.error('M8_HTTP_QA_FAILED; no secrets logged');process.exitCode=1;}finally{await db.close();}
