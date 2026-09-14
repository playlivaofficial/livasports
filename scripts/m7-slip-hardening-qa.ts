import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readSlipComparison,type SlipComparisonRead} from '../src/odds/read-repository';
import {buildSlipComparison} from '../src/slip/comparison';
import {multiplyDecimalOdds,potentialReturn} from '../src/slip/decimal';
import {marketKey,parseResolutionRequest,SLIP_SCOPE,type CanonicalSelection} from '../src/slip/types';
import type {BookmakerSlip,SlipComparison} from '../src/slip/comparison-types';

const origin=process.argv[2]??'https://livasports.com';
if(!['https://livasports.com','http://localhost:3300'].includes(origin))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const db=new PostgresDatabaseClient(databaseUrl()!);
type QuoteRow={public_id:string;slug:string;market:string;outcome:string;line:string|number|null;bookmaker:string;odds:string};
function selectionFrom(row:QuoteRow):CanonicalSelection|null {
  if(row.market==='MATCH_WINNER'&&(row.outcome==='HOME'||row.outcome==='DRAW'||row.outcome==='AWAY'))
    return {fixturePublicId:row.public_id,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:row.outcome,line:null};
  if(row.market==='TOTAL_GOALS'&&Number(row.line)===2.5&&(row.outcome==='OVER'||row.outcome==='UNDER'))
    return {fixturePublicId:row.public_id,scope:SLIP_SCOPE,market:'TOTAL_GOALS',outcome:row.outcome,line:2.5};
  if(row.market==='BTTS'&&(row.outcome==='YES'||row.outcome==='NO'))
    return {fixturePublicId:row.public_id,scope:SLIP_SCOPE,market:'BTTS',outcome:row.outcome,line:null};
  return null;
}
function take<T extends {selection:CanonicalSelection;slug:string}>(pool:T[],n:number,used=new Set<string>()){
  const out:T[]=[];
  const byComp=new Map<string,T[]>();
  for(const value of pool){
    if(used.has(marketKey(value.selection)))continue;
    const list=byComp.get(value.slug)??[];list.push(value);byComp.set(value.slug,list);
  }
  const slugs=[...byComp.keys()];
  for(let i=0;out.length<n&&slugs.length;i++){
    const slug=slugs[i%slugs.length];
    const list=byComp.get(slug)??[];
    const value=list.find(v=>!out.some(item=>marketKey(item.selection)===marketKey(v.selection)));
    if(!value){byComp.delete(slug);slugs.splice(slugs.indexOf(slug),1);i--;continue;}
    used.add(marketKey(value.selection));out.push(value);
  }
  return out;
}
function validSlip(legs:Array<{selection:CanonicalSelection}>){
  return parseResolutionRequest({locale:'br',selections:legs.map(v=>v.selection)})!==null;
}
function unexplainedBook(b:BookmakerSlip|undefined){
  if(!b)return true;
  if(/\bNaN\b/.test(JSON.stringify(b))||b.combinedDecimalOdds==='?'||b.combinedDecimalOdds==='—')return true;
  if(b.complete)return !b.combinedDecimalOdds||b.availabilityState!=='COMPLETE'||!b.requiredSelectionCount;
  return Boolean(b.combinedDecimalOdds)||!b.availabilityState||b.availabilityState==='COMPLETE';
}
function classify(comparison:SlipComparison){
  const betano=comparison.bookmakers.find(b=>b.bookmakerId==='betano.bet.br');
  const betsson=comparison.bookmakers.find(b=>b.bookmakerId==='betsson');
  return {betano,betsson,both:Boolean(betano?.complete&&betsson?.complete),betanoOnly:Boolean(betano?.complete&&!betsson?.complete),betssonOnly:Boolean(!betano?.complete&&betsson?.complete)};
}
async function compareRemote(selections:CanonicalSelection[]){
  const response=await fetch(origin+'/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'br',selections}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const body=await response.json() as {providerRequests?:number;comparison?:{bookmakers:BookmakerSlip[]};error?:string};
  return {status:response.status,body};
}

try{
  const quotes=(await db.query(`SELECT f.public_id,c.slug,o.market_code AS market,o.outcome_code AS outcome,o.line,
      b.provider_slug AS bookmaker,o.decimal_odds AS odds
    FROM odds_current o
    JOIN fixtures f ON f.id=o.fixture_id AND f.status='SCHEDULED' AND f.kickoff>now()
    JOIN competitions c ON c.id=f.competition_id AND c.enabled
    JOIN bookmakers b ON b.id=o.bookmaker_id
    WHERE o.status='ACTIVE' AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION'
      AND o.market_code IN ('MATCH_WINNER','BTTS','TOTAL_GOALS')
      AND now()-o.observed_at < make_interval(mins => COALESCE(o.freshness_ttl_minutes, 15)::int)
    ORDER BY f.kickoff,c.slug`)).rows as QuoteRow[];
  const byKey=new Map<string,{selection:CanonicalSelection;slug:string;books:Record<string,string>}>();
  for(const row of quotes){
    const selection=selectionFrom(row);if(!selection)continue;
    const id=`${selection.fixturePublicId}:${selection.market}:${selection.outcome}:${selection.line??'none'}`;
    const entry=byKey.get(id)??{selection,slug:row.slug,books:{}};
    entry.books[row.bookmaker]=String(row.odds);byKey.set(id,entry);
  }
  const candidates=[...byKey.values()];
  const ids=[...new Set(candidates.map(v=>v.selection.fixturePublicId))];
  const fixtures:SlipComparisonRead['fixtures']=new Map();
  let bookmakers:SlipComparisonRead['bookmakers']=[];
  for(let i=0;i<ids.length;i+=10){
    const chunk=await readSlipComparison(db,ids.slice(i,i+10),'BR');
    for(const [id,read] of chunk.fixtures)fixtures.set(id,read);
    bookmakers=chunk.bookmakers;
  }
  const data={fixtures,bookmakers};
  const evaluated=candidates.map(value=>{
    const comparison=buildSlipComparison([value.selection],'br',data.fixtures,data.bookmakers);
    return {...value,...classify(comparison),comparison};
  });
  const both=evaluated.filter(v=>v.both);
  const betanoOnly=evaluated.filter(v=>v.betanoOnly);
  const betssonOnly=evaluated.filter(v=>v.betssonOnly);
  const mwBoth=both.filter(v=>v.selection.market==='MATCH_WINNER');
  const btts=both.filter(v=>v.selection.market==='BTTS');
  const ou=both.filter(v=>v.selection.market==='TOTAL_GOALS');
  const plans:Array<{id:string;legs:typeof both;stake:string}> =[];
  for(const [n,label] of [[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']] as const){
    const legs=take(mwBoth,n);
    if(legs.length===n&&validSlip(legs))plans.push({id:`both-mw-${label}`,legs,stake:'10'});
  }
  if(mwBoth.length&&btts.length&&ou.length){
    const used=new Set<string>();
    const mixed=[...take(mwBoth,1,used),...take(btts,1,used),...take(ou,1,used)];
    if(mixed.length===3&&validSlip(mixed))plans.push({id:'both-mixed-3',legs:mixed,stake:'20'});
  }
  for(let i=0,n=1;plans.filter(p=>p.id.startsWith('both')).length<12&&i<mwBoth.length;i++){
    const legs=take(mwBoth.slice(i),Math.min(3,mwBoth.length-i));
    if(legs.length<2||!validSlip(legs))continue;
    if(plans.some(p=>p.legs.map(v=>marketKey(v.selection)).join('|')===legs.map(v=>marketKey(v.selection)).join('|')))continue;
    plans.push({id:`both-extra-${n++}`,legs,stake:'50'});
  }
  if(betanoOnly.length&&validSlip(take(betanoOnly,1)))plans.push({id:'betano-only-1',legs:take(betanoOnly,1),stake:'10'});
  if(betanoOnly.length>=2&&validSlip(take(betanoOnly,2)))plans.push({id:'betano-only-2',legs:take(betanoOnly,2),stake:'10'});
  if(betssonOnly.length&&validSlip(take(betssonOnly,1)))plans.push({id:'betsson-only-1',legs:take(betssonOnly,1),stake:'10'});
  if(betssonOnly.length>=2&&validSlip(take(betssonOnly,2)))plans.push({id:'betsson-only-2',legs:take(betssonOnly,2),stake:'10'});
  if(betanoOnly.length&&betssonOnly.length){
    const mixed=[...take(betanoOnly,1),...take(betssonOnly,1)];
    if(validSlip(mixed))plans.push({id:'both-incomplete-mixed',legs:mixed,stake:'10'});
  }
  if(mwBoth.length&&betanoOnly.length){
    const used=new Set<string>();
    const mixed=[...take(mwBoth,1,used),...take(betanoOnly,1,used)];
    if(validSlip(mixed))plans.push({id:'betano-plus-shared',legs:mixed,stake:'10'});
  }
  const leftovers=mwBoth.filter(v=>!plans.some(p=>p.legs.length===1&&p.legs[0].selection.fixturePublicId===v.selection.fixturePublicId));
  for(let i=0;plans.length<30&&i<leftovers.length;i++){
    if(!validSlip([leftovers[i]]))continue;
    plans.push({id:`fill-${plans.length+1}`,legs:[leftovers[i]],stake:i%2?'10.5':'20'});
  }
  if(plans.length<30){
    for(let i=0;plans.length<30&&i<both.length;i++){
      if(plans.some(p=>p.legs.length===1&&marketKey(p.legs[0].selection)===marketKey(both[i].selection)))continue;
      if(!validSlip([both[i]]))continue;
      plans.push({id:`fill-both-${plans.length+1}`,legs:[both[i]],stake:'10'});
    }
  }
  const rows=[];
  for(const plan of plans.slice(0,30)){
    const selections=plan.legs.map(v=>v.selection);
    const comparison=buildSlipComparison(selections,'br',data.fixtures,data.bookmakers);
    const remote=await compareRemote(selections);
    const books=comparison.bookmakers;
    const betano=books.find(b=>b.bookmakerId==='betano.bet.br');
    const betsson=books.find(b=>b.bookmakerId==='betsson');
    const unexplained=unexplainedBook(betano)||unexplainedBook(betsson)
      ||remote.body.providerRequests!==0||(remote.status!==200&&remote.status!==0)
      ||/\bNaN\b/.test(JSON.stringify(comparison));
    rows.push({
      slipId:plan.id,legCount:selections.length,markets:[...new Set(selections.map(s=>s.market))],
      competitions:[...new Set(plan.legs.map(v=>v.slug))],stake:plan.stake,
      betanoComplete:Boolean(betano?.complete),betanoTotal:betano?.combinedDecimalOdds??null,
      betanoReturn:betano?.complete&&betano.combinedDecimalOdds?potentialReturn(plan.stake,betano.combinedDecimalOdds):null,
      betanoReason:betano?.complete?null:betano?.availabilityState??'MISSING',
      betanoDiagnostic:betano?.selectionQuotes.map(q=>q.diagnosticCode)??[],
      betssonComplete:Boolean(betsson?.complete),betssonTotal:betsson?.combinedDecimalOdds??null,
      betssonReturn:betsson?.complete&&betsson.combinedDecimalOdds?potentialReturn(plan.stake,betsson.combinedDecimalOdds):null,
      betssonReason:betsson?.complete?null:betsson?.availabilityState??'MISSING',
      betssonDiagnostic:betsson?.selectionQuotes.map(q=>q.diagnosticCode)??[],
      bestComplete:books.find(book=>book.best)?.displayName??null,
      unexplained,providerRequests:remote.body.providerRequests??null,http:remote.status,
      localProductCheck:betano?.complete&&betsson?.complete&&plan.legs.every(v=>v.books['betano.bet.br']&&v.books['betsson'])?{
        betano:multiplyDecimalOdds(plan.legs.map(v=>v.books['betano.bet.br'])),
        betsson:multiplyDecimalOdds(plan.legs.map(v=>v.books['betsson'])),
      }:null,
    });
  }
  const summary={
    tested:rows.length,bothComplete:rows.filter(r=>r.betanoComplete&&r.betssonComplete).length,
    betanoOnly:rows.filter(r=>r.betanoComplete&&!r.betssonComplete).length,
    betssonOnly:rows.filter(r=>!r.betanoComplete&&r.betssonComplete).length,
    bothIncomplete:rows.filter(r=>!r.betanoComplete&&!r.betssonComplete).length,
    unexplained:rows.filter(r=>r.unexplained).length,providerRequests:rows.every(r=>r.providerRequests===0),
    competitions:[...new Set(rows.flatMap(r=>r.competitions))],
    pools:{both:both.length,betanoOnly:betanoOnly.length,betssonOnly:betssonOnly.length,mwBoth:mwBoth.length,btts:btts.length,ou:ou.length},
  };
  await writeFile('output/m7-slip-hardening-private.json',JSON.stringify({at:new Date().toISOString(),origin,summary,rows},null,2));
  console.info(JSON.stringify(summary));
  if(summary.tested<30||summary.unexplained!==0||!summary.providerRequests||summary.bothComplete<10)process.exitCode=1;
}finally{await db.close();}
