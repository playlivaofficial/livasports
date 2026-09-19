/** Bounded QA, never follows an operator redirect and never calls a sports/odds provider. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readSlipComparison} from '../src/odds/read-repository';
import {buildSlipComparison} from '../src/slip/comparison';
import {multiplyDecimalOdds,potentialReturn} from '../src/slip/decimal';
import {SLIP_SCOPE,type CanonicalSelection} from '../src/slip/types';
import type {FullSlipResolution} from '../src/slip/comparison-types';

const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)??'https://livasports.com';
if(!['https://livasports.com','http://localhost:3300'].includes(base))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const alerts=process.argv.includes('--alerts');
const keyFile=process.argv.find(a=>a.startsWith('--owner-key-file='))?.slice(17)??'output/hardening-owner-permanent-key.txt';
const runId=randomUUID(),anonymousId='qa_'+randomUUID().replaceAll('-',''),sessionId='qa_'+randomUUID().replaceAll('-','');
const checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];let requests=0,ownerCookie='';
const check=(name:string,pass:boolean,detail?:unknown)=>checks.push({name,pass,...(detail===undefined?{}:{detail})});
const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:10_000});
async function call(path:string,options:{body?:unknown;anonymous?:boolean;method?:string}={}){
  if(!path.startsWith('/')||path.startsWith('//')||requests>=55)throw new Error('SMOKE_REQUEST_BOUNDARY');requests++;
  const response=await fetch(base+path,{method:options.method??(options.body===undefined?'GET':'POST'),redirect:'manual',signal:AbortSignal.timeout(60_000),
    headers:{'user-agent':'LivaSportsLaunchQA/1.0','x-livasports-qa':'1',origin:base,'sec-fetch-site':'same-origin','content-type':'application/json',
      cookie:`ls_aid=${anonymousId}; ls_sid=${sessionId}${!options.anonymous&&ownerCookie?'; '+ownerCookie:''}`},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});
  const text=await response.text();let body:Record<string,unknown>|null=null;try{body=JSON.parse(text);}catch{/* HTML/XML */}
  return {response,body,text};
}
const event=(name:string,extra:Record<string,unknown>={})=>({eventId:randomUUID(),eventName:name,eventVersion:1,occurredAt:new Date().toISOString(),sessionId,anonymousId,locale:'br',pageType:'home',canonicalPath:'/br',referrerClass:'direct',utm:{},...extra});
try{
  const health=await call('/api/internal/health',{anonymous:true});check('public-health',health.response.status===200,{status:health.response.status,release:health.body?.release});
  for(const path of ['/br','/mx','/en','/br/futebol','/mx/futbol','/en/football','/br/ao-vivo','/mx/en-vivo','/en/live','/br/jogos/hoje','/mx/partidos/hoy','/en/matches/today','/br/entrar','/en/sign-in','/mx/iniciar-sesion','/robots.txt','/sitemap.xml','/sports-sitemaps.xml']){
    const start=Date.now(),r=await call(path,{anonymous:true});check('public:'+path,r.response.status===200,{status:r.response.status,ms:Date.now()-start});
  }
  const anon=await call('/api/owner/health',{anonymous:true});check('anonymous-owner-blocked',anon.response.status===401,{status:anon.response.status});
  const raw=await readFile(keyFile,'utf8');const key=/^PERMANENT_OWNER_KEY=(\S+)\s*$/m.exec(raw)?.[1];if(!key)throw new Error('PRIVATE_OWNER_KEY_NOT_FOUND');
  const login=await call('/api/owner/preview',{body:{action:'login',key}});check('permanent-owner-key',login.response.status===200&&login.body?.authorized===true);
  const cookie=login.response.headers.get('set-cookie')??'';ownerCookie=cookie.split(';')[0];
  const ownerMaxAge=Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
  check('owner-cookie-security',/; Secure(?:;|$)/i.test(cookie)&&/; HttpOnly(?:;|$)/i.test(cookie)&&/SameSite=Strict/i.test(cookie)&&ownerMaxAge>=2591990&&ownerMaxAge<=2592000,{maxAgeSeconds:ownerMaxAge});
  if(login.response.status!==200)throw new Error('OWNER_LOGIN_FAILED');
  const owner=await call('/api/owner/health');check('owner-health',owner.response.status===200&&owner.body?.providerRequests===0,{overall:owner.body?.overall,alerting:owner.body?.alerting});
  for(const path of ['/owner/health','/owner/analytics']){const r=await call(path);check(path,r.response.status===200&&/noindex/.test(r.text+r.response.headers.get('x-robots-tag')),{status:r.response.status});}
  const ownerUser=await call('/api/auth/session');check('owner-does-not-impersonate-user',!ownerUser.body?.user);
  const preview=await call('/api/owner/preview',{body:{action:'preview',enabled:true}});ownerCookie=(preview.response.headers.get('set-cookie')??'').split(';')[0];check('owner-preview-on',preview.body?.preview===true);
  const candidates=(await db.query(`SELECT f.public_id,f.kickoff FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE c.enabled AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<now()+interval '7 days'
    AND EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id AND o.market_code='MATCH_WINNER' AND o.outcome_code='HOME' AND o.status='ACTIVE' AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION'
      AND o.freshness_ttl_minutes>0 AND o.observed_at+o.freshness_ttl_minutes*interval '1 minute'>now() AND abs(extract(epoch FROM (f.kickoff-o.provider_kickoff)))<=600)
    ORDER BY f.kickoff LIMIT 35`)).rows;
  const all=[];
  for(let i=0;i<candidates.length;i+=10){const ids=candidates.slice(i,i+10).map(r=>String(r.public_id));const data=await readSlipComparison(db,ids,'BR');
    for(const fixturePublicId of ids){const selection:CanonicalSelection={fixturePublicId,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null};
      const comparison=buildSlipComparison([selection],'br',data.fixtures,data.bookmakers);all.push({selection,comparison});}}
  const real=all.filter(r=>r.comparison.bookmakers.length===2&&r.comparison.bookmakers.every(b=>b.complete&&b.proxySelectionCount===0));
  const proxy=all.filter(r=>r.comparison.bookmakers.every(b=>b.complete)&&r.comparison.bookmakers.some(b=>b.proxySelectionCount>0));
  const mixed=[...proxy.slice(0,2),...real].slice(0,5);
  const samples=[{name:'three-real',rows:real.slice(0,3),size:3},{name:'five-mixed',rows:mixed,size:5}];
  for(const sample of samples){
    if(sample.rows.length!==sample.size||sample.name==='five-mixed'&&!proxy.length){check('slip:'+sample.name,false,{reason:'NO_CURRENT_SAMPLE'});continue;}
    const result=await call('/api/slip/compare',{body:{locale:'br',selections:sample.rows.map(r=>r.selection)}});const slip=result.body as unknown as FullSlipResolution;
    const books=slip?.comparison?.bookmakers??[];
    const valid=books.length===2&&books.every(b=>b.complete&&b.combinedDecimalOdds===multiplyDecimalOdds(b.selectionQuotes.map(q=>q.decimalOdds!))&&b.selectionQuotes.every(q=>q.sourceBookmakerId&&(q.priceKind!=='REAL'||q.sourceBookmakerId===b.bookmakerId)));
    check('slip:'+sample.name,result.response.status===200&&slip.providerRequests===0&&valid,{status:result.response.status,providerRequests:slip.providerRequests,
      fixtureIds:sample.rows.map(r=>r.selection.fixturePublicId),books:books.map(b=>({bookmaker:b.bookmakerId,real:b.realSelectionCount,proxy:b.proxySelectionCount,combined:b.combinedDecimalOdds,stake10Return:b.combinedDecimalOdds?potentialReturn('10',b.combinedDecimalOdds):null,cta:b.ctaState}))});
  }
  const finished=(await db.query("SELECT public_id FROM fixtures WHERE status='FINISHED' ORDER BY kickoff DESC LIMIT 1")).rows[0];
  const unavailable=await call('/api/slip/compare',{body:{locale:'br',selections:[{fixturePublicId:finished.public_id,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null}]}});
  const unavailableSlip=unavailable.body as unknown as FullSlipResolution;check('finished-leg-unavailable',unavailable.response.status===200&&unavailableSlip.providerRequests===0&&unavailableSlip.comparison.bookmakers.every(b=>!b.complete&&b.combinedDecimalOdds===null));
  const startEvent=event('session_started',{session:{landingPath:'/br',landingPageType:'home',visitorKind:'NEW'}}),page=event('page_viewed');
  const batch={v:1,qa:true,batch:[startEvent,page,event('odds_visible'),event('slip_opened',{slipLegCount:3}),event('bookmaker_comparison_viewed',{slipLegCount:3,comparisonState:'REAL_COMPLETE'})]};
  const ingested=await call('/api/events',{body:batch}),replayed=await call('/api/events',{body:batch});check('qa-analytics-ingestion',[200,204].includes(ingested.response.status)&&[200,204].includes(replayed.response.status));
  const offers=await call('/api/commercial/offers',{body:[{locale:'br',pagePath:'/br',placement:'home_top_banner',bookmaker:'betsson'}]});
  const offer=(offers.body?.offers as Array<{href:string;token:string;bookmaker:string;placement:string;creative:unknown}>|undefined)?.[0];
  check('approved-owner-preview-offer',offers.response.status===200&&offers.body?.providerRequests===0&&!!offer);
  if(offer){
    await call('/api/events',{body:{v:1,qa:true,batch:[event('affiliate_cta_viewed',{bookmaker:'betsson',placement:offer.placement}),event('affiliate_cta_clicked',{bookmaker:'betsson',placement:offer.placement})]}});
    const clickPath=new URL(offer.href,base);if(clickPath.origin!==base||!clickPath.pathname.startsWith('/go/'))throw new Error('UNSAFE_TEST_OFFER');
    const redirect=await call(clickPath.pathname+clickPath.search);const destination=redirect.response.headers.get('location');
    check('safe-affiliate-redirect',redirect.response.status===303&&!!destination&&new URL(destination,base).protocol==='https:',{status:redirect.response.status,destinationHost:destination?new URL(destination,base).hostname:null,followed:false});
    await call(clickPath.pathname+clickPath.search);
    const injection=await call(clickPath.pathname+clickPath.search+'&url=https%3A%2F%2Fexample.invalid');check('open-redirect-rejected',injection.response.status===400);
  }
  if(alerts){
    for(const phase of ['OPENED','RESOLVED'])for(let repeat=0;repeat<2;repeat++){
      const r=await call('/api/owner/health',{body:{action:'test-alert',runId,phase,confirm:true}});check(`alert:${phase}:${repeat}`,r.response.status===200&&r.body?.code===(repeat?'ALREADY_SENT':'SENT'),{code:r.body?.code,providerRequests:r.body?.providerRequests});
    }
  }
  // HTTP checks above provide time for deferred writes; no page visit reaches an operator.
  const quality=(await db.query(`SELECT count(*)::int AS events,count(DISTINCT event_id)::int AS unique_events,count(*) FILTER(WHERE traffic_class='HUMAN')::int AS human,
    count(*) FILTER(WHERE event_name='outbound_redirect_completed')::int AS outbound FROM analytics_events WHERE session_id=$1 AND anonymous_id=$2`,[sessionId,anonymousId])).rows[0];
  check('qa-dedupe-human-exclusion',quality.events===quality.unique_events&&quality.human===0,quality);
  const links=(await db.query(`SELECT count(*)::int AS paired FROM analytics_events e JOIN affiliate_clicks c ON e.event_id=c.id AND e.campaign_id=c.campaign_id WHERE e.session_id=$1 AND e.event_name='outbound_redirect_completed' AND e.traffic_class<>'HUMAN' AND c.traffic_class='QA_TEST'`,[sessionId])).rows[0];
  check('affiliate-ledger-reconciliation',quality.outbound===1&&links.paired===1,{outbound:quality.outbound,paired:links.paired});
}catch(error){check('execution',false,{code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'SMOKE_CHECK_FAILED'});}
finally{
  if(ownerCookie){try{const r=await call('/api/owner/preview',{body:{action:'logout'}});check('owner-logout',r.body?.authorized===false&&/Max-Age=0/.test(r.response.headers.get('set-cookie')??''));}catch{check('owner-logout',false);}}
  await db.close();
  const result={at:new Date().toISOString(),base,runId,requests,providerRequests:0,operatorRequests:0,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks};
  await writeFile('output/hardening-launch-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
}
