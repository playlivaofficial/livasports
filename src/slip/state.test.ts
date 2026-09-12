import {describe,it,expect,vi} from 'vitest';
import {canonicalSelection,parseResolutionRequest,selectionKey,SLIP_SCOPE,type CanonicalSelection} from './types';
import {createSlipStore,EMPTY_SLIP,mutateSlip,restoreSlip,STORAGE_KEY,type SlipStorage} from './state';
const addedAt='2026-09-12T12:00:00.000Z';
const pick=(n=1):CanonicalSelection=>({fixturePublicId:n.toString(16).padStart(16,'0'),scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null});
const add=(n=1)=>({type:'add' as const,selection:pick(n),addedAt});
describe('canonical guest intent',()=>{
  it('adds, deduplicates rapid taps, removes and clears without any provider call',()=>{
    const fetch=vi.spyOn(globalThis,'fetch');const first=mutateSlip(EMPTY_SLIP,add());
    expect(first.result).toBe('ADDED');expect(mutateSlip(first.slip,add()).result).toBe('UNCHANGED');
    expect(mutateSlip(first.slip,{type:'remove',key:selectionKey(pick())}).slip.selections).toEqual([]);
    expect(mutateSlip(first.slip,{type:'clear'}).result).toBe('CLEARED');expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it('requires explicit same-fixture replacement and rejects stale confirmations',()=>{
    const first=mutateSlip(EMPTY_SLIP,add()).slip;
    const over:CanonicalSelection={...pick(),market:'TOTAL_GOALS',outcome:'OVER',line:2.5};
    expect(mutateSlip(first,{type:'add',selection:over,addedAt}).result).toBe('REPLACE_REQUIRED');
    expect(mutateSlip(first,{type:'replace',selection:over,expectedKey:'wrong',addedAt}).result).toBe('REPLACE_REQUIRED');
    const replaced=mutateSlip(first,{type:'replace',selection:over,expectedKey:selectionKey(pick()),addedAt});
    expect(replaced.result).toBe('REPLACED');expect(replaced.slip.selections).toEqual([{...over,addedAt}]);
  });
  it('caps at ten without dropping entries, while allowing replacement at the cap',()=>{
    let slip=EMPTY_SLIP;for(let n=1;n<=10;n++)slip=mutateSlip(slip,add(n)).slip;
    expect(mutateSlip(slip,add(11))).toEqual({slip,result:'LIMIT'});
    expect(mutateSlip(slip,{type:'replace',selection:{...pick(),market:'BTTS',outcome:'YES',line:null},addedAt,expectedKey:selectionKey(pick())}).slip.selections).toHaveLength(10);
  });
  it('bookmaker, kickoff, price and translated labels cannot define or survive saved identity',()=>{
    const raw=JSON.stringify({version:1,selections:[{...pick(),addedAt,bookmaker:'test-only',price:'9.99',kickoff:'2030-01-01',label:'test-only'}]});
    const restored=restoreSlip(raw).slip;expect(restored.selections).toEqual([{...pick(),addedAt}]);
    expect(selectionKey(restored.selections[0])).toBe(selectionKey(pick()));
    expect(JSON.stringify(restored)).not.toMatch(/bookmaker|price|kickoff|label/);
  });
  it.each(['{','null','[]','"oops"',JSON.stringify({version:1,selections:null})])('recovers corrupt storage %s',raw=>{
    expect(restoreSlip(raw)).toEqual({slip:EMPTY_SLIP,notice:'RECOVERED'});
  });
  it('migrates known v0 scope only, rejects unknown versions and drops invalid selections independently',()=>{
    const {scope:_,...legacy}=pick();void _;
    expect(restoreSlip(JSON.stringify({version:0,selections:[{...legacy,addedAt}]})).slip.selections).toEqual([{...pick(),addedAt}]);
    expect(restoreSlip(JSON.stringify({version:99,selections:[pick()]})).notice).toBe('UNSUPPORTED_VERSION');
    expect(restoreSlip(JSON.stringify({version:1,selections:[{...pick(),addedAt},{...pick(2),market:'DOUBLE_CHANCE',addedAt},{...pick(3),addedAt:'bad'}]})).slip.selections).toHaveLength(1);
  });
  it.each([{market:'TOTAL_GOALS',outcome:'OVER',line:3.5},{market:'TOTAL_GOALS',outcome:'OVER',line:'2.5'},
    {market:'BTTS',outcome:'HOME',line:null},{market:'MATCH_WINNER',outcome:'OVER',line:null},{scope:'FIRST_HALF'},{fixturePublicId:"' OR 1=1--"}])('rejects unsupported identity %j',bad=>{
    expect(canonicalSelection({...pick(),...bad})).toBeNull();
  });
  it('strict API input excludes bookmaker identity, duplicates and more than ten',()=>{
    expect(parseResolutionRequest({locale:'br',selections:[pick()]})).not.toBeNull();
    expect(parseResolutionRequest({locale:'mx',selections:[pick()]})).not.toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:[{...pick(),bookmaker:'betano.bet.br'}]})).toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:[pick(),pick()]})).toBeNull();
    expect(parseResolutionRequest({locale:'br',selections:Array.from({length:11},(_,i)=>pick(i+1))})).toBeNull();
  });
});
describe('browser persistence adapter',()=>{
  function storage(){const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
  it('restores a new page and converges two tabs without storage write loops',()=>{
    const disk=storage();const write=vi.spyOn(disk,'setItem');const a=createSlipStore(()=>disk),b=createSlipStore(()=>disk);
    a.dispatch(add());b.reload();expect(b.getSnapshot().slip.selections).toHaveLength(1);
    b.dispatch(add(2));a.reload();expect(a.getSnapshot().slip.selections).toHaveLength(2);expect(write).toHaveBeenCalledTimes(2);
    expect(createSlipStore(()=>disk).getSnapshot().ready).toBe(false);
    const page=createSlipStore(()=>disk);page.reload();expect(page.getSnapshot().slip).toEqual(a.getSnapshot().slip);
    expect(disk.values.get(STORAGE_KEY)).not.toContain('decimalOdds');
  });
  it('preserves in-memory work when browser storage is unavailable or write-blocked',()=>{
    const broken:SlipStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};const store=createSlipStore(()=>broken);
    store.dispatch(add());store.dispatch(add(2));store.reload();
    expect(store.getSnapshot().slip.selections).toHaveLength(2);expect(store.getSnapshot().notice).toBe('STORAGE_UNAVAILABLE');
    const denied=createSlipStore(()=>{throw new Error('denied');});denied.dispatch(add());denied.reload();expect(denied.getSnapshot().slip.selections).toHaveLength(1);
  });
});
