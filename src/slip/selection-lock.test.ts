import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {comparisonFixture} from './comparison-fixtures.test-support';
import {selectablePrices,resolveLockedSelection,type SelectionLock} from './selection-lock';
import {signSelection,verifySelection} from './selection-receipt';
import {selectionKey,wireSelection,parseResolutionRequest} from './types';
import {selectSlipRequest} from './admission-server';
import {ComparisonLoader} from './comparison-loader';
import {enforceSelectionLocks,buildSlipComparison} from './comparison';
import {restoreSlip,mutateSlip,EMPTY_SLIP,createSlipStore} from './state';
import {currentSlipDestination} from './comparison-server';
import {publicSlipResolution} from './public-response';
import {validComparisonResponse} from './comparison-response';
import {createHmac} from 'node:crypto';
import {signOffer} from '@/affiliate/tokens';
import type {OfferToken} from '@/affiliate/types';
const key='selection-test-only-signing-secret-not-a-production-credential';
function setup(count=1){
  const f=comparisonFixture(count,Date.now());
  const locks=f.selections.map(s=>{
    const price=selectablePrices(s,f.data.fixtures.get(s.fixturePublicId)!,f.now).find(p=>p.bookmaker==='betsson')!;
    const lock:SelectionLock={v:1,key:selectionKey(s),geo:'CO',book:price.bookmaker,quote:price.sourceQuoteId!,provider:'ODDSPAPI',price:price.decimalOdds,observed:price.sourceObservedAt!,expires:Date.parse(price.expiresAt)};
    return lock;
  });
  return {...f,locks,bound:f.selections.map((s,i)=>({...s,receipt:signSelection(locks[i],key)}))};
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('strict selection identity and availability',()=>{
  it('accepts previously signed object receipts and keeps ten-leg transport within existing edge limits',()=>{
    const f=setup(10),value=Buffer.from(JSON.stringify(f.locks[0])).toString('base64url');
    const signature=createHmac('sha256',key).update('livasports:strict-selection:v1:'+value).digest('base64url');
    expect(verifySelection({...f.bound[0],receipt:value+'.'+signature},'CO',key)).toEqual(f.locks[0]);
    const context={locale:'co',pagePath:'/co',placement:'slip_bookmaker_comparison',bookmaker:'betsson',selections:f.bound} as OfferToken['context'];
    const offer=signOffer({v:1,viewId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',campaignId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',context,expiresAt:Date.now()+60000},key);
    expect(('/api/commercial/go?offer='+offer).length).toBeLessThan(8192);
    expect(JSON.stringify({contexts:[context,{...context,bookmaker:'bwin'}]}).length).toBeLessThan(16384);
  });
  it('keeps the selected book despite a higher-priced alternative',()=>{
    const f=setup();expect(resolveLockedSelection(f.bound[0],f.data.fixtures.get(f.selections[0].fixturePublicId)!,f.locks[0],'CO',f.now).price?.bookmaker).toBe('betsson');
  });
  it.each(['SUSPENDED','WITHDRAWN','STALE','CLOSED'] as const)('suspends %s selected odds, proposes but never silently chooses the fallback',status=>{
    const f=setup(),read=f.data.fixtures.get(f.selections[0].fixturePublicId)!;read.snapshot.quotes[0].status=status;
    const resolved=resolveLockedSelection(f.bound[0],read,f.locks[0],'CO',f.now);
    expect(resolved.price).toBeNull();expect(resolved.state).toBe('SUSPENDED');expect(resolved.alternative?.bookmaker).toBe('bwin');
  });
  it.each(['0','-1','1','NaN','1001'])('never selects invalid price %s',price=>{
    const f=setup(),read=f.data.fixtures.get(f.selections[0].fixturePublicId)!;read.snapshot.quotes=read.snapshot.quotes.map(q=>({...q,decimalOdds:price}));
    expect(selectablePrices(f.selections[0],read,f.now)).toEqual([]);
  });
  it('rejects missing/expired identities, price changes, provider replacement, foreign GEO and informational references',()=>{
    const f=setup(),s=f.bound[0],read=f.data.fixtures.get(s.fixturePublicId)!;
    for(const lock of [null,{...f.locks[0],expires:f.now},{...f.locks[0],price:'9.00'},{...f.locks[0],provider:'OTHER_PROVIDER'},{...f.locks[0],geo:'MX'}])expect(resolveLockedSelection(s,read,lock,'CO',f.now).price).toBeNull();
    read.snapshot.quotes=[];expect(resolveLockedSelection(s,read,f.locks[0],'CO',f.now).price).toBeNull();
  });
  it('requires explicit newly signed acceptance after recovery; a refresh never extends the original expiry',()=>{
    const f=setup(),read=f.data.fixtures.get(f.bound[0].fixturePublicId)!;
    read.snapshot.quotes[0].decimalOdds='2.40';expect(resolveLockedSelection(f.bound[0],read,f.locks[0],'CO',f.now).price).toBeNull();
    const next={...f.locks[0],price:'2.40'};
    expect(resolveLockedSelection(f.bound[0],read,next,'CO',f.now).price?.decimalOdds).toBe('2.40');
    expect(resolveLockedSelection(f.bound[0],read,next,'CO',next.expires).price).toBeNull();
  });
  it('rejects altered receipt, outcome, market, fixture, GEO, price or signature',()=>{
    const f=setup();expect(verifySelection(f.bound[0],'CO',key)).toEqual(f.locks[0]);
    expect(verifySelection(f.bound[0],'MX',key)).toBeNull();
    expect(verifySelection({...f.bound[0],fixturePublicId:'aaaaaaaaaaaaaaaa'},'CO',key)).toBeNull();
    expect(verifySelection({...f.bound[0],receipt:f.bound[0].receipt.replace(/^./,'!')},'CO',key)).toBeNull();
    expect(verifySelection({...f.bound[0],market:'MATCH_WINNER',line:null,outcome:'DRAW'},'CO',key)).toBeNull();
    expect(verifySelection(f.bound[0],'CO','wrong-key')).toBeNull();
  });
  it.each([1,3,5,10])('authoritatively rechecks a %s-leg comparison; one failed leg cannot poison other fixture selections',async count=>{
    vi.stubEnv('AFFILIATE_SIGNING_SECRET',key);const f=setup(count),reader=vi.fn(async()=>f.data),loader=new ComparisonLoader(reader,()=>f.now);
    const first=await loader.resolve(f.bound,'co','CO');expect(first.comparison.bookmakers.every(b=>b.complete)).toBe(true);
    const publicResult=publicSlipResolution(first);expect(validComparisonResponse(publicResult.comparison,'co',f.bound)).toBe(true);
    expect(publicResult.selections.every(s=>!('receipt' in s.selection))).toBe(true);
    f.data.fixtures.get(f.bound[0].fixturePublicId)!.snapshot.quotes[0].status='WITHDRAWN';
    const next=await loader.resolve(f.bound,'co','CO');expect(reader).toHaveBeenCalledTimes(2);
    expect(next.selections[0].price).toBeNull();expect(next.selections.slice(1).every(s=>s.price)).toBe(true);
    expect(next.comparison.bookmakers.every(b=>!b.complete&&b.combinedDecimalOdds===null&&b.ctaState==='INCOMPLETE')).toBe(true);
    const isolated=await loader.resolve(f.bound.slice(1),'co','CO');if(count>1)expect(isolated.comparison.bookmakers.every(b=>b.complete)).toBe(true);
  });
  it('blocks direct unbound comparisons and affiliate destinations even when other-book odds exist',async()=>{
    const f=setup(),loader=new ComparisonLoader(async()=>f.data,()=>f.now);
    expect((await loader.resolve(f.selections,'co','CO')).comparison.bookmakers.every(b=>!b.complete)).toBe(true);
    expect(await currentSlipDestination('betsson',f.selections,'co',async()=>f.data,'CO')).toBeNull();
    vi.stubEnv('AFFILIATE_SIGNING_SECRET',key);
    expect(await currentSlipDestination('betsson',f.bound,'co',async()=>f.data,'CO')).toBe(f.data.destinations.betsson);
  });
  it('preserves old slip entries without fabricating bindings, and round-trips signed identity without altering canonical identity',()=>{
    const f=setup(),saved=mutateSlip(EMPTY_SLIP,{type:'add',selection:f.bound[0],addedAt:new Date(f.now).toISOString()}).slip;
    expect(restoreSlip(JSON.stringify(saved)).slip.selections[0].receipt).toBe(f.bound[0].receipt);
    expect(parseResolutionRequest({locale:'co',selections:saved.selections.map(wireSelection)})?.selections).toEqual(f.bound);
    expect(selectionKey(saved.selections[0])).toBe(selectionKey(f.selections[0]));
    const old={...saved,selections:[{...f.selections[0],addedAt:new Date(f.now).toISOString()}]};
    expect(restoreSlip(JSON.stringify(old)).slip.selections).toEqual(old.selections);
  });
  it('tracks clear/remove/replace races per market while leaving unrelated fixture admission independent',()=>{
    const storage={getItem:()=>null,setItem:()=>{}};const store=createSlipStore(()=>storage);store.reload();const f=setup(2),k=selectionKey(f.selections[0]);
    const key1=f.selections[0].fixturePublicId+':FULL_TIME_REGULATION:MATCH_WINNER:none';const before=store.getRevision(key1);
    store.dispatch({type:'add',selection:f.bound[1],addedAt:new Date().toISOString()});expect(store.getRevision(key1)).toBe(before);
    store.dispatch({type:'clear'});expect(store.getRevision(key1)).not.toBe(before);
    const once=mutateSlip(EMPTY_SLIP,{type:'add',selection:f.bound[0],addedAt:new Date().toISOString()}).slip;
    expect(mutateSlip(once,{type:'confirm',selection:{...f.bound[0],receipt:'changed'},expectedReceipt:'outdated',addedAt:new Date().toISOString()}).slip).toEqual(once);expect(k).toBe(selectionKey(f.bound[0]));
  });
  it('enforces render-time comparison blocking after selected odds expire',()=>{
    const f=setup();const resolved=f.bound.map((s,i)=>resolveLockedSelection(s,f.data.fixtures.get(s.fixturePublicId)!,f.locks[i],'CO',f.locks[i].expires));
    expect(enforceSelectionLocks(buildSlipComparison(f.bound,'co',f.data.fixtures,f.data.bookmakers,f.now),resolved).bookmakers.every(b=>!b.complete)).toBe(true);
  });
});
describe('direct admission API',()=>{
  it('rejects expiry during an asynchronous DB read and never signs that quote',async()=>{
    vi.stubEnv('VERCEL','1');const f=setup();
    const reader=async()=>{vi.spyOn(Date,'now').mockReturnValue(f.locks[0].expires);return f.data.fixtures;};
    const response=await selectSlipRequest(new Request('https://livasports.com/api/slip/select',{method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':'CO'},body:JSON.stringify({locale:'co',selection:f.selections[0],bookmaker:'betsson',decimalOdds:'2.10'})}),reader,f.now,key);
    expect(response.status).toBe(409);expect((await response.json()).error).toBe('QUOTE_EXPIRED');
  });
  it.each(['MX','CO','PE'] as const)('verifies fresh genuine odds for %s without touching a provider',async geo=>{
    vi.stubEnv('VERCEL','1');
    const f=setup(),fetch=vi.spyOn(globalThis,'fetch');
    const request=new Request('https://livasports.com/api/slip/select',{method:'POST',headers:{origin:'https://livasports.com','content-type':'application/json','x-vercel-ip-country':geo},body:JSON.stringify({locale:geo.toLowerCase(),selection:f.selections[0],bookmaker:'betsson',decimalOdds:'2.10'})});
    const response=await selectSlipRequest(request,async()=>f.data.fixtures,f.now,key);
    expect(response.status).toBe(200);expect(verifySelection((await response.json()).selection,geo,key)?.book).toBe('betsson');expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['0','2.99','NaN'])('rejects direct invalid or obsolete price %s',async decimalOdds=>{
    vi.stubEnv('VERCEL','1');
    const f=setup(),reader=vi.fn(async()=>f.data.fixtures);
    const response=await selectSlipRequest(new Request('https://livasports.com/api/slip/select',{method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':'CO'},body:JSON.stringify({locale:'co',selection:f.selections[0],bookmaker:'betsson',decimalOdds})}),reader,f.now,key);
    expect([400,409]).toContain(response.status);
  });
});
