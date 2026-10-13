import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {comparisonFixture} from './comparison-fixtures.test-support';
import {selectSlipRequest} from './admission-server';
import {verifySelection,signSelection} from './selection-receipt';
import {selectableComparisonPrices,resolveLockedSelection} from './selection-lock';
import {ComparisonLoader} from './comparison-loader';
import {currentSlipDestination} from './comparison-server';
import {publicSlipResolution} from './public-response';
import {guardResolved} from './resolution';
import {receiptDisplay,selectionKey,type BoundSelection} from './types';
import {mutateSlip,EMPTY_SLIP,restoreSlip} from './state';
import {primaryVisibleBookmakers} from '@/odds/fallback-pool';
import {SELECTIONS,type OddsMarket} from '@/odds/types';
import {minusTenPercent} from '@/odds/calculated-estimate';
import {signOffer} from '@/affiliate/tokens';
import type {OfferToken} from '@/affiliate/types';
const key='indicative-selection-test-signing-key-not-a-production-secret';
type Geo='MX'|'CO'|'PE';
function setup(geo:Geo='CO',count=1,sourceIndex=1){
  const f=comparisonFixture(count,Date.now()),pair=primaryVisibleBookmakers(geo),locale=geo.toLowerCase() as 'mx'|'co'|'pe';
  vi.stubEnv('VERCEL','1');vi.stubEnv('AFFILIATE_SIGNING_SECRET',key);
  f.data.bookmakers=f.data.bookmakers.map((b,i)=>({...b,bookmakerId:pair[i],displayName:pair[i],geoEligibility:{locale,eligible:true},insuranceEnabled:false}));
  for(const read of f.data.fixtures.values()){
    read.snapshot={...read.snapshot,fixtureId:read.fixture.publicId,insuranceEnabled:false,referenceGapBookmakers:pair,
      eligibleBookmakers:pair.map((id,priority)=>({id,name:id,priority})),quotes:read.snapshot.quotes.map((q,i)=>({...q,bookmaker:pair[i],bookmakerId:pair[i],bookmakerName:pair[i]}))};
    read.snapshot.quotes=read.snapshot.quotes.filter(q=>q.bookmaker===pair[sourceIndex]);
  }
  return {...f,pair,locale,geo};
}
async function admit(f:ReturnType<typeof setup>,index=0,kind:'REAL'|'CALCULATED_MINUS_10'='CALCULATED_MINUS_10',overrides:Record<string,unknown>={}){
  const selection=f.selections[index],read=f.data.fixtures.get(selection.fixturePublicId)!;
  const p=selectableComparisonPrices(selection,read,f.now).find(p=>p.priceKind===kind)!;
  const input={locale:f.locale,selection,bookmaker:p?.bookmaker??f.pair[0],decimalOdds:p?.decimalOdds??'1.8',priceKind:kind,...overrides};
  return selectSlipRequest(new Request('https://livasports.com/api/slip/select',{method:'POST',headers:{origin:'https://livasports.com','content-type':'application/json','x-vercel-ip-country':f.geo},body:JSON.stringify(input)}),async()=>f.data.fixtures,f.now,key);
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('server-verified indicative planning selections, never executable synthetic quotes',()=>{
  for(const geo of ['MX','CO','PE'] as const)for(const market of Object.keys(SELECTIONS) as OddsMarket[])for(const sourceIndex of [0,1]){
    it(`${geo}/${market}/source-${sourceIndex}: every genuine and estimated outcome can enter the slip with its chosen identity`,async()=>{
      for(const outcome of SELECTIONS[market]){
        const f=setup(geo,1,sourceIndex),s=f.selections[0],read=f.data.fixtures.get(s.fixturePublicId)!;
        Object.assign(s,{market,outcome,line:market==='TOTAL_GOALS'?2.5:null});
        read.snapshot.quotes=read.snapshot.quotes.map(q=>({...q,market,outcome,line:s.line}));
        for(const kind of ['REAL','CALCULATED_MINUS_10'] as const){
          const r=await admit(f,0,kind);expect(r.status).toBe(200);const body=await r.json(),lock=verifySelection(body.selection,geo,key)!;
          expect(body.providerRequests).toBe(0);expect(lock.book).toBe(f.pair[kind==='REAL'?sourceIndex:1-sourceIndex]);
          expect(lock.key).toBe(selectionKey(s));expect(lock.v).toBe(kind==='REAL'?1:2);expect(receiptDisplay(body.selection)?.priceKind).toBe(kind);
          const result=await new ComparisonLoader(async()=>f.data,()=>f.now).resolve([body.selection],f.locale,geo);
          expect(result.selections[0]).toMatchObject({state:'CURRENT',price:{bookmaker:lock.book,priceKind:kind}});
          expect(result.comparison.bookmakers).toHaveLength(2);expect(result.comparison.bookmakers.every(b=>b.complete||b.indicativeComplete)).toBe(true);
          expect(await currentSlipDestination(f.pair[1-sourceIndex],[body.selection],f.locale,async()=>f.data,geo)).toBeNull();
        }
      }
    });
  }
  it.each([1,3,5,10])('retains %s mixed genuine/estimated legs and both indicative comparisons without fabricated actual returns',async count=>{
    const f=setup('CO',count),bound:BoundSelection[]=[];
    for(let i=0;i<count;i++){
      const r=await admit(f,i,i%2?'REAL':'CALCULATED_MINUS_10');expect(r.status).toBe(200);bound.push((await r.json()).selection);
    }
    const result=await new ComparisonLoader(async()=>f.data,()=>f.now).resolve(bound,'co','CO');
    expect(result.selections.every(s=>s.state==='CURRENT')).toBe(true);
    const actual=result.comparison.bookmakers.find(b=>b.bookmakerId==='bwin')!,estimated=result.comparison.bookmakers.find(b=>b.bookmakerId==='betsson')!;
    expect(actual.complete).toBe(true);expect(estimated.indicativeComplete).toBe(true);expect(estimated.combinedDecimalOdds).toBeNull();expect(estimated.ctaState).toBe('INCOMPLETE');
    const saved=bound.reduce((slip,selection)=>mutateSlip(slip,{type:'add',selection,addedAt:new Date(f.now).toISOString()}).slip,EMPTY_SLIP);
    expect(restoreSlip(JSON.stringify(saved)).slip.selections.map(selectionKey)).toEqual(bound.map(selectionKey));
    const publicResult=publicSlipResolution(result);expect(publicResult.selections.every(s=>guardResolved(s,f.now).price)).toBe(true);
    expect(JSON.stringify(publicResult)).not.toContain('sourceQuoteId');expect(JSON.stringify(publicResult)).not.toContain('receipt');
    const context={locale:'co',pagePath:'/co',placement:'slip_bookmaker_comparison',bookmaker:'bwin',selections:bound} as OfferToken['context'];
    const offer=signOffer({v:1,viewId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',campaignId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',context,expiresAt:f.now+60000},key);
    expect(('/api/commercial/go?offer='+offer).length).toBeLessThan(8192);
  });
  it('upgrades the same chosen book to genuine on recovery, without losing the original selected price kind',async()=>{
    const f=setup(),read=f.data.fixtures.get(f.selections[0].fixturePublicId)!,body=await(await admit(f)).json();
    const lock=verifySelection(body.selection,'CO',key)!;
    expect(lock.sourceBook).toBe('bwin');expect(lock.price).toBe(minusTenPercent('2.15'));
    read.snapshot.quotes.push({...read.snapshot.quotes[0],quoteId:'genuine-recovery',bookmaker:'betsson',bookmakerId:'betsson',bookmakerName:'Betsson',decimalOdds:'2.20'});
    const result=await new ComparisonLoader(async()=>f.data,()=>f.now).resolve([body.selection],'co','CO');
    expect(result.selections[0]).toMatchObject({state:'CURRENT',price:{bookmaker:'betsson',priceKind:'REAL',decimalOdds:'2.20'}});
    expect(result.comparison.bookmakers.every(b=>b.complete)).toBe(true);expect(receiptDisplay(body.selection)?.priceKind).toBe('CALCULATED_MINUS_10');
    expect(await currentSlipDestination('betsson',[body.selection],'co',async()=>f.data,'CO')).toBe(f.data.destinations.betsson);
  });
  it('suspends expired, missing, or withdrawn sources without deleting the canonical choice; restores only from genuine current source',async()=>{
    const f=setup(),read=f.data.fixtures.get(f.selections[0].fixturePublicId)!,body=await(await admit(f)).json(),lock=verifySelection(body.selection,'CO',key)!;
    const original=read.snapshot.quotes[0];
    for(const status of ['STALE','WITHDRAWN','SUSPENDED','CLOSED'] as const){
      read.snapshot.quotes=[{...original,status}];const resolved=resolveLockedSelection(body.selection,read,lock,'CO',f.now);
      expect(resolved.selection).toEqual(body.selection);expect(resolved.price).toBeNull();
    }
    read.snapshot.quotes=[];expect(resolveLockedSelection(body.selection,read,lock,'CO',f.now).price).toBeNull();
    read.snapshot.quotes=[original];const resolved=resolveLockedSelection(body.selection,read,lock,'CO',f.now);
    expect(guardResolved(resolved,lock.expires).price).toBeNull();expect(guardResolved(resolved,f.now,false).price).toBeNull();
    expect(resolveLockedSelection(body.selection,read,lock,'CO',f.now).price?.priceKind).toBe('CALCULATED_MINUS_10');
  });
  it('rejects tampered identity/formula/GEO and a calculation masquerading as a genuine price',async()=>{
    const f=setup(),body=await(await admit(f)).json(),lock=verifySelection(body.selection,'CO',key)!;
    expect(verifySelection(body.selection,'MX',key)).toBeNull();
    expect(verifySelection({...body.selection,outcome:'AWAY'},'CO',key)).toBeNull();
    for(const change of [{price:'9'}, {sourceBook:'1xbet'}, {sourcePrice:'0'}, {book:'winpot.mx'}]){
      expect(verifySelection({...body.selection,receipt:signSelection({...lock,...change},key)},'CO',key)).toBeNull();
    }
    expect((await admit(f,0,'CALCULATED_MINUS_10',{priceKind:'REAL'})).status).toBe(409);
    expect((await admit(f,0,'CALCULATED_MINUS_10',{decimalOdds:'2.99'})).status).toBe(409);
    expect((await admit(f,0,'CALCULATED_MINUS_10',{bookmaker:'1xbet'})).status).toBe(409);
  });
  it('rejects expiry during DB admission, and allows exact below-one factors only as indicative planning prices',async()=>{
    const f=setup(),read=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
    read.snapshot.quotes[0].decimalOdds='1.05';const body=await(await admit(f)).json();
    expect(body.price).toMatchObject({decimalOdds:'0.945',priceKind:'CALCULATED_MINUS_10'});
    expect(verifySelection(body.selection,'CO',key)?.v).toBe(2);
    vi.spyOn(Date,'now').mockReturnValue(Date.parse(body.price.expiresAt));
    expect((await admit(f)).status).toBe(409);
  });
});
