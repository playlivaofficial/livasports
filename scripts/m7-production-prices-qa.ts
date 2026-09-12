// Real production data only. All HTTP actions use the LivaSports read boundary.
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {SLIP_SCOPE,type CanonicalSelection} from '../src/slip/types';
import type {FullSlipResolution} from '../src/slip/comparison-types';
const base='https://livasports.com',db=new PostgresDatabaseClient(databaseUrl()!);
const checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
function check(name:string,pass:boolean,detail?:unknown){checks.push({name,pass,detail});if(!pass)throw Error('QA_FAILED: '+name);}
async function usage(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports`)).rows[0];}
async function compare(selections:CanonicalSelection[],locale='br'){
  const start=performance.now();const r=await fetch(base+'/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale,selections})});
  if(r.status!==200)throw Error('PRODUCTION_COMPARISON_FAILED');return {value:await r.json() as FullSlipResolution,ms:Math.round(performance.now()-start)};
}
// Independent rational oracle: compare integer cross-products without importing engine math.
function fraction(s:string):[bigint,bigint]{const [a,b='']=s.split('.');return [BigInt(a+b),10n**BigInt(b.length)];}
try{
  const before=await usage();
  const rows=(await db.query(`SELECT f.public_id,f.kickoff FROM fixtures f WHERE f.status='SCHEDULED' AND f.kickoff>now()
    AND EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id AND o.status='ACTIVE' AND o.observed_at>now()-interval '15 minutes') ORDER BY f.kickoff LIMIT 60`)).rows;
  const both:CanonicalSelection[]=[],partial:CanonicalSelection[]=[];
  const markets=[{market:'MATCH_WINNER',outcome:'HOME',line:null},{market:'TOTAL_GOALS',outcome:'OVER',line:2.5},{market:'BTTS',outcome:'YES',line:null}] as const;
  for(let offset=0;offset<rows.length;offset+=10){
    const selections=rows.slice(offset,offset+10).map((r,i)=>({fixturePublicId:r.public_id,scope:SLIP_SCOPE,...markets[(offset+i)%3]}));
    const {value}=await compare(selections);
    selections.forEach((s,i)=>{const n=value.comparison.bookmakers.filter(b=>b.selectionQuotes[i].decimalOdds!==null).length;if(n===2)both.push(s);else if(n===1)partial.push(s);});
  }
  check('real current same-selection sample exists',both.length>=10,{completeCandidates:both.length,partialCandidates:partial.length});
  const samples:Record<string,{selections:CanonicalSelection[];value:FullSlipResolution;ms:number}>={};
  for(const count of [1,3,10]){
    const selections=both.slice(0,count),result=await compare(selections);samples[String(count)]={selections,...result};
    check(`both real BR bookmakers complete ${count}`,result.value.comparison.bookmakers.length===2&&result.value.comparison.bookmakers.every(b=>b.complete&&b.availableSelectionCount===count));
    for(const b of result.value.comparison.bookmakers){
      const actual=fraction(b.combinedDecimalOdds!);const product=b.selectionQuotes.reduce<[bigint,bigint]>((p,q)=>{const f=fraction(q.decimalOdds!);return [p[0]*f[0],p[1]*f[1]];},[1n,1n]);
      check(`exact independent product ${b.bookmakerId} ${count}`,actual[0]*product[1]===actual[1]*product[0],{quotes:b.selectionQuotes.map(q=>q.decimalOdds),combined:b.combinedDecimalOdds});
      check(`unconfigured commercial gate ${b.bookmakerId} ${count}`,b.ctaState==='AFFILIATE_UNAVAILABLE'&&b.outboundCapability==='NONE'&&b.affiliateEligibility.approved===(b.bookmakerId==='betsson')&&!b.affiliateEligibility.destinationConfigured);
    }
    const [a,b]=result.value.comparison.bookmakers,af=fraction(a.combinedDecimalOdds!),bf=fraction(b.combinedDecimalOdds!),difference=af[0]*bf[1]-bf[0]*af[1];
    check(`independent price-only ranking ${count}`,a.best===(difference>=0n)&&b.best===(difference<=0n)&&a.tiedBest===(difference===0n)&&b.tiedBest===(difference===0n));
  }
  if(partial.length){
    const selections=[...both.slice(0,2).filter(s=>s.fixturePublicId!==partial[0].fixturePublicId),partial[0]],result=await compare(selections);samples.partial={selections,...result};
    check('real partial has no total or best while one complete has no best',result.value.comparison.bookmakers.filter(b=>b.complete).length===1&&result.value.comparison.bookmakers.every(b=>!b.best&&(b.complete||b.combinedDecimalOdds===null)),result.value.comparison.bookmakers.map(b=>({id:b.bookmakerId,count:b.availableSelectionCount,total:b.combinedDecimalOdds})));
  }
  const repeat=await compare([...samples['10'].selections].reverse());check('reordered complete totals identical',repeat.value.comparison.bookmakers.every(b=>b.combinedDecimalOdds===samples['10'].value.comparison.bookmakers.find(a=>a.bookmakerId===b.bookmakerId)?.combinedDecimalOdds),{firstMs:samples['10'].ms,repeatMs:repeat.ms});
  const mx=await compare(samples['10'].selections,'mx');check('real current BR pricing does not leak into MX',mx.value.comparison.bookmakers.length===0&&mx.value.selections.every(s=>s.price===null));
  const eventId=randomUUID(),event={eventId,eventName:'slip_comparison_view',locale:'br',placement:'slip-comparison',selectionCount:3,marketsSummary:{MATCH_WINNER:1,TOTAL_GOALS:1,BTTS:1}};
  const statuses=[];for(let i=0;i<2;i++)statuses.push((await fetch(base+'/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)})).status);
  const eventRows=(await db.query('SELECT count(*) AS n FROM product_events WHERE event_id=$1',[eventId])).rows[0];check('production analytics idempotent',statuses.every(s=>s===204)&&Number(eventRows.n)===1,{statuses,rows:eventRows.n});
  const after=await usage();check('real current pricing and analytics provider delta zero',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const result={at:new Date().toISOString(),status:'PASS',base,checks,samples};await writeFile('output/m7-production-prices-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,samples:Object.fromEntries(Object.entries(samples).map(([k,s])=>[k,{selections:s.selections,ms:s.ms,bookmakers:s.value.comparison.bookmakers.map(b=>({id:b.bookmakerId,available:b.availableSelectionCount,combined:b.combinedDecimalOdds,best:b.best,expires:s.value.comparison.expiresAt}))}]))}));
}catch(error){console.error(error instanceof Error?error.message:'M7_PRODUCTION_PRICE_QA_FAILED');process.exitCode=1;}finally{await db.close();}
