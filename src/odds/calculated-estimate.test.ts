import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {buildComparison} from './comparison';
import {minusTenPercent,currentEstimate,publicEstimate,comparisonPair} from './calculated-estimate';
import {publicOddsComparisons} from './public-response';
import {listingMatchWinnerOdds} from './listing';
import {SELECTIONS,type OddsMarket,type OddsReadSnapshot,type ReadOddsQuote} from './types';
import {primaryVisibleBookmakers} from './fallback-pool';
import {CORE_GEOS} from '@/config/geo';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {buildSlipComparison,guardSlipComparison,enforceSelectionLocks} from '@/slip/comparison';
import {indicativePotentialReturn,multiplyIndicativeFactors,potentialReturn,validDecimalOdds} from '@/slip/decimal';
import {selectablePrices,resolveLockedSelection,type SelectionLock} from '@/slip/selection-lock';
import {selectionKey,wireSelection} from '@/slip/types';
import {signSelection} from '@/slip/selection-receipt';
import {selectSlipRequest} from '@/slip/admission-server';
import {currentSlipDestination} from '@/slip/comparison-server';
import {mutateSlip,EMPTY_SLIP,restoreSlip} from '@/slip/state';
const now=Date.parse('2026-10-13T11:00:00Z');
function snapshot(pair:readonly string[],market:OddsMarket):OddsReadSnapshot {
 const kickoff=new Date(now+3600000).toISOString(),observedAt=new Date(now).toISOString();
 const quotes:ReadOddsQuote[]=pair.flatMap((book,index)=>SELECTIONS[market].map((outcome,i)=>({quoteId:`q-${book}-${outcome}`,fixtureId:'f',providerFixtureId:'p',bookmaker:book,bookmakerId:book,bookmakerName:book,market,outcome,line:market==='TOTAL_GOALS'?2.5:null,decimalOdds:String(2+i+index),status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:observedAt,observedAt,sourceDomain:'test.invalid',persistedAt:observedAt,lastSuccessfulRefreshAt:observedAt,providerKickoff:kickoff,geoEligible:true,freshnessTtlMinutes:20})));
 return {fixtureId:'f',fixtureStatus:'SCHEDULED',kickoff,quotes,referenceGapBookmakers:pair,eligibleBookmakers:pair.map((id,priority)=>({id,name:id,priority})),insuranceEnabled:false};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('ordered local −10% comparison; never native bookmaker truth',()=>{
 it.each([['2.00','1.8'],['2.50','2.25'],['3.00','2.7'],['4.00','3.6'],['1.05','0.945'],['2.123456789012345678','1.9111111101111111102']])('calculates %s exactly as %s without clamping', (source,expected)=>expect(minusTenPercent(source)).toBe(expected));
 it.each(['0','1','-2','NaN','1001','2e0',''])('rejects invalid genuine source %s',source=>expect(minusTenPercent(source)).toBeNull());
 for(const geo of CORE_GEOS)for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
  it(`${geo}/${market}: real wins; missing outcomes get only separate non-executable estimates`,()=>{
   const pair=primaryVisibleBookmakers(geo),s=snapshot(pair,market),outcomes=SELECTIONS[market];
   expect(buildComparison(s,market,now).estimates).toBeUndefined();
   s.quotes=s.quotes.filter(q=>q.bookmaker!==pair[1]||q.outcome===outcomes[0]);
   const result=buildComparison(s,market,now,{[pair[1]]:'approved-actual-only'});
   expect(result.estimates).toHaveLength(outcomes.length-1);
   expect(result.estimates?.some(e=>e.outcome===outcomes[0])).toBe(false);
   expect(result.rows[1].cells[0]).toMatchObject({decimalOdds:'3',priceKind:'REAL',sourceBookmaker:pair[1]});
   for(const estimate of result.estimates??[]){
    expect(estimate).toMatchObject({targetBookmaker:pair[1],sourceBookmaker:pair[0],executable:false,affiliateEligible:false,market,line:result.line});
    expect(estimate.decimalOdds).toBe(minusTenPercent(estimate.sourceDecimalOdds));
    expect(result.rows[1].cells.find(c=>c.outcome===estimate.outcome)).toMatchObject({decimalOdds:null,priceKind:null,best:false});
   }
   expect(result.eligiblePrices).toBe(outcomes.length+1);
   const publicResult=publicOddsComparisons([result])[0];
   expect(publicResult.estimates?.every(e=>!('sourceQuoteId' in e)&&e.sourceBookmaker===pair[0])).toBe(true);
   if(market==='MATCH_WINNER')expect(listingMatchWinnerOdds(s,now).calculatedOdds).toEqual(publicResult.estimates);
  });
 }
 it.each(['STALE','WITHDRAWN','SUSPENDED','CLOSED'] as const)('does not calculate from %s source',status=>{
  const s=snapshot(['betsson','bwin'],'MATCH_WINNER');s.quotes=s.quotes.filter(q=>q.bookmaker==='betsson').map(q=>({...q,status}));
  expect(buildComparison(s,'MATCH_WINNER',now).estimates).toBeUndefined();
 });
 it('does not reverse the pair, chain, cross GEOs, or invent odds with no source',()=>{
  const s=snapshot(['betsson','bwin'],'MATCH_WINNER');s.quotes=s.quotes.filter(q=>q.bookmaker==='bwin');
  expect(buildComparison(s,'MATCH_WINNER',now).estimates).toBeUndefined();
  s.quotes=[];expect(buildComparison(s,'MATCH_WINNER',now).estimates).toBeUndefined();
  expect(comparisonPair(['betsson','1xbet'])).toBeNull();expect(comparisonPair(['betsson','bwin','winpot.mx'])).toBeNull();
 });
 it('closes at source expiry/kickoff; rejects modified formula/provenance and contains no executable CTA',()=>{
  const s=snapshot(['betsson','bwin'],'MATCH_WINNER');s.quotes=s.quotes.filter(q=>q.bookmaker==='betsson');
  const c=buildComparison(s,'MATCH_WINNER',now,{bwin:'must-not-enable'}),e=c.estimates![0];
  expect(c.rows[1].action).toBeNull();expect(currentEstimate(publicEstimate(e),now)).toBe(true);
  expect(currentEstimate(e,Date.parse(e.expiresAt))).toBe(false);
  expect(buildComparison(s,'MATCH_WINNER',Date.parse(s.kickoff)).estimates).toBeUndefined();
  expect(currentEstimate({...e,decimalOdds:'3.00'},now)).toBe(false);
  expect(currentEstimate({...e,sourceBookmaker:'bwin'},now)).toBe(false);
  s.fixtureStatus='FINISHED';expect(buildComparison(s,'MATCH_WINNER',now).estimates).toBeUndefined();
 });
});
describe('slip canonical integrity and actual versus indicative returns',()=>{
 it.each([1,3,5,10])('keeps all %s canonical legs with separate mathematical total, no target quote or CTA',count=>{
  const f=comparisonFixture(count,now);f.data.bookmakers=f.data.bookmakers.map(b=>({...b,insuranceEnabled:false}));
  for(const read of f.data.fixtures.values())read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker==='betsson');
  const comparison=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,now),target=comparison.bookmakers[1];
  expect(comparison.bookmakers[0].complete).toBe(true);
  expect(target).toMatchObject({complete:false,estimated:false,availableSelectionCount:0,realSelectionCount:0,calculatedSelectionCount:count,combinedDecimalOdds:null,indicativeComplete:true,ctaState:'INCOMPLETE',best:false});
  expect(target.selectionQuotes.map(q=>q.selection)).toEqual(f.selections);
  const expected=multiplyIndicativeFactors(comparison.bookmakers[0].selectionQuotes.map(q=>minusTenPercent(q.decimalOdds!)!));
  expect(target.indicativeCombinedDecimalOdds).toBe(expected);
  expect(target.selectionQuotes.every(q=>q.decimalOdds===null&&q.priceKind===null)).toBe(true);
  for(const selection of f.selections)expect(selectablePrices(selection,f.data.fixtures.get(selection.fixturePublicId)!,now).every(p=>p.bookmaker==='betsson')).toBe(true);
  const stored=f.selections.reduce((slip,s)=>mutateSlip(slip,{type:'add',selection:s,addedAt:new Date(now).toISOString()}).slip,EMPTY_SLIP);
  expect(restoreSlip(JSON.stringify(stored)).slip.selections.map(wireSelection)).toEqual(f.selections);
  expect(guardSlipComparison(comparison,count,now,false).bookmakers[1].indicativeCombinedDecimalOdds).toBeNull();
  expect(guardSlipComparison(comparison,count,Date.parse(target.selectionQuotes[0].estimate!.expiresAt)).bookmakers[1].indicativeComplete).toBe(false);
 });
 it('mixes actual target and calculated legs only in the indicative total; real recovery overrides calculation',()=>{
  const f=comparisonFixture(3,now);f.data.bookmakers.forEach(b=>b.insuranceEnabled=false);
  const read=f.data.fixtures.get(f.selections[0].fixturePublicId)!,original=read.snapshot.quotes[1];read.snapshot.quotes.pop();
  const b=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,now).bookmakers[1];
  expect(b.availableSelectionCount).toBe(2);expect(b.combinedDecimalOdds).toBeNull();expect(b.calculatedSelectionCount).toBe(1);
  expect(b.indicativeCombinedDecimalOdds).toBe(multiplyIndicativeFactors(['1.89','1.82','1.65']));
  read.snapshot.quotes.push(original);const recovered=buildSlipComparison(f.selections,'co',f.data.fixtures,f.data.bookmakers,now).bookmakers[1];
  expect(recovered.complete).toBe(true);expect(recovered.calculatedSelectionCount).toBe(0);expect(recovered.indicativeCombinedDecimalOdds).toBeNull();
 });
 it('shows the exact low factor only as a mathematical estimate, never fabricates a valid decimal quote',()=>{
  expect(validDecimalOdds(minusTenPercent('1.05')!)).toBe(false);
  expect(indicativePotentialReturn('10','0.945')).toBe('9.50');expect(potentialReturn('10','0.945')).toBeNull();
  expect(indicativePotentialReturn('10','1.8')).toBe('18.00');expect(potentialReturn('10','2')).toBe('20.00');
 });
 it('rejects direct admission of the calculated target price and protects the already signed source selection',async()=>{
  vi.stubEnv('VERCEL','1');const key='unit-test-quote-identity-only-not-production';vi.stubEnv('AFFILIATE_SIGNING_SECRET',key);vi.spyOn(Date,'now').mockReturnValue(now);
  const f=comparisonFixture(1,now),s=f.selections[0],read=f.data.fixtures.get(s.fixturePublicId)!;
  f.data.bookmakers.forEach(b=>b.insuranceEnabled=false);read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker==='betsson');
  const source=selectablePrices(s,read,now)[0],lock:SelectionLock={v:1,key:selectionKey(s),geo:'CO',book:'betsson',quote:source.sourceQuoteId!,provider:'ODDSPAPI',price:source.decimalOdds,observed:source.sourceObservedAt!,expires:Date.parse(source.expiresAt)};
  const bound={...s,receipt:signSelection(lock,key)};
  const req=new Request('https://livasports.com/api/slip/select',{method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':'CO'},body:JSON.stringify({locale:'co',selection:s,bookmaker:'bwin',decimalOdds:'1.89'})});
  expect((await selectSlipRequest(req,async()=>f.data.fixtures,now,key)).status).toBe(409);
  expect(await currentSlipDestination('bwin',[bound],'co',async()=>f.data,'CO')).toBeNull();
  expect(resolveLockedSelection(bound,read,lock,'CO',now).price?.bookmaker).toBe('betsson');
  read.snapshot.quotes[0].status='WITHDRAWN';const resolved=resolveLockedSelection(bound,read,lock,'CO',now);
  expect(resolved.selection.fixturePublicId).toBe(s.fixturePublicId);expect(resolved.price).toBeNull();
  expect(enforceSelectionLocks(buildSlipComparison([bound],'co',f.data.fixtures,f.data.bookmakers,now),[resolved]).bookmakers.every(b=>!b.indicativeComplete&&!b.complete)).toBe(true);
 });
});
