import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('@/analytics/client',()=>({track:vi.fn()}));
vi.mock('./events',()=>({emitSlipEvent:vi.fn()}));
import {addSlipSelection,slipStore} from './client';
import {SLIP_SCOPE,marketKey,type CanonicalSelection} from './types';
const pick=(id='0000000000000001'):Extract<CanonicalSelection,{market:'MATCH_WINNER'}>=>({fixturePublicId:id,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null});
const receipt=Buffer.from(JSON.stringify({book:'betsson',price:'2.10',expires:Date.now()+3600000,observed:new Date().toISOString()})).toString('base64url')+'.'+'a'.repeat(43);
let stored:string|null=null;
beforeEach(()=>{
  stored=null;
  vi.stubGlobal('window',{localStorage:{getItem:()=>stored,setItem:(_:string,v:string)=>{stored=v;},removeItem:()=>{stored=null;}},dispatchEvent:vi.fn()});
  vi.stubGlobal('CustomEvent',class {constructor(public type:string,public detail:unknown){}});
  slipStore.reload();slipStore.dispatch({type:'clear'});
});
afterEach(()=>vi.unstubAllGlobals());
const context={targetBookmaker:'betsson',priceKind:'REAL' as const,decimalOdds:'2.10'};
const expiry=()=>new Date(Date.now()+60000).toISOString();
const response=(selection=pick(),decimalOdds='2.10')=>Response.json({selection:{...selection,receipt},price:{bookmaker:'betsson',decimalOdds,expiresAt:expiry()},providerRequests:0});
describe('asynchronous selection admission',()=>{
  it.each(['0','NaN','1'])('never sends or saves an invalid price %s',async price=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    // Server checks are authoritative; client prefilter is also required.
    await addSlipSelection(pick(),'co',expiry(),'betsson',{...context,decimalOdds:price});
    expect(fetch).not.toHaveBeenCalled();expect(slipStore.getSnapshot().slip.selections).toEqual([]);
  });
  it('only commits after server acknowledgement and deduplicates concurrent same-market clicks',async()=>{
    let resolve!:(r:Response)=>void;const fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
    const task=addSlipSelection(pick(),'co',expiry(),'betsson',context);
    await addSlipSelection(pick(),'co',expiry(),'betsson',context);
    expect(fetch).toHaveBeenCalledTimes(1);expect(slipStore.getSnapshot().slip.selections).toEqual([]);
    resolve(response());await task;expect(slipStore.getSnapshot().slip.selections[0].receipt).toBe(receipt);
  });
  it('a clear during an outstanding request cannot be undone by its late response',async()=>{
    let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>{resolve=r;}));
    const task=addSlipSelection(pick(),'co',expiry(),'betsson',context);slipStore.dispatch({type:'clear'});
    resolve(response());await task;expect(slipStore.getSnapshot().slip.selections).toEqual([]);
  });
  it('an unrelated fixture can be selected while another admission is pending',async()=>{
    let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;})).mockResolvedValueOnce(response(pick('0000000000000002'))));
    const task=addSlipSelection(pick(),'co',expiry(),'betsson',context);
    await addSlipSelection(pick('0000000000000002'),'co',expiry(),'betsson',context);
    resolve(response());await task;expect(slipStore.getSnapshot().slip.selections).toHaveLength(2);
  });
  it('a replaced market while admission is pending prevents an obsolete outcome being restored',async()=>{
    let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>{resolve=r;}));
    const task=addSlipSelection(pick(),'co',expiry(),'betsson',context);
    const alternate={...pick(),outcome:'AWAY' as const,receipt};slipStore.dispatch({type:'add',selection:alternate,addedAt:new Date().toISOString()});
    resolve(response());await task;expect(slipStore.getSnapshot().slip.selections[0].outcome).toBe('AWAY');expect(slipStore.getRevision(marketKey(pick()))).toBeTruthy();
  });
  it.each([409,503])('a server %s cannot enter My Slip',async status=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:'UNAVAILABLE'},{status})));
    await addSlipSelection(pick(),'co',expiry(),'betsson',context);expect(slipStore.getSnapshot().slip.selections).toEqual([]);
  });
  it('a changed server price cannot be silently accepted',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(pick(),'3.00')));
    await addSlipSelection(pick(),'co',expiry(),'betsson',context);expect(slipStore.getSnapshot().slip.selections).toEqual([]);
  });
});
