import {describe,it,expect,vi} from 'vitest';
import {collectWikinews,wikinewsCandidates} from './wikinews-discovery';
import {candidateDraft,validateDiscoveryPackage} from './discovery';
import {validateNewsDraft} from './model';
import {collectScheduledDiscovery} from './automation/runner';
const now=new Date('2026-10-21T12:00:00Z');
const page={ns:0,title:'A verified tennis announcement',categories:[{title:'Category:Published'},{title:'Category:October 20, 2026'}]};
const data=(p=page)=>({query:{pages:[p]}});
describe('licensed discovery is not automatic fact approval',()=>{
 it('keeps genuine dated candidates private until verified',()=>{const candidates=wikinewsCandidates(data(),'wikinews-tennis',now);expect(candidates).toHaveLength(1);expect(validateDiscoveryPackage({version:1,discoveredAt:now.toISOString(),candidates},now)).toBe(true);expect(validateNewsDraft(candidateDraft(candidates[0]),now).length).toBeGreaterThan(0);});
 it('never treats recent insertion timestamps as publication freshness',()=>{expect(wikinewsCandidates(data({...page,categories:[{title:'Category:Published'},{title:'Category:March 10, 2026'}]}),'wikinews-tennis',now)).toEqual([]);expect(wikinewsCandidates({query:{pages:[{...page,timestamp:now.toISOString(),categories:[]}]}},'wikinews-tennis',now)).toEqual([]);});
 it.each(['Category:Disputed','Category:Retracted','Category:Developing','Category:Corrections'])('excludes %s',title=>{expect(wikinewsCandidates(data({...page,categories:[...page.categories,{title}]}),'wikinews-tennis',now)).toEqual([]);});
 it('rejects future dates and non-article namespaces',()=>{expect(wikinewsCandidates(data({...page,ns:14}),'wikinews-tennis',now)).toEqual([]);expect(wikinewsCandidates(data({...page,categories:[{title:'Category:Published'},{title:'Category:October 22, 2026'}]}),'wikinews-tennis',now)).toEqual([]);});
 it('makes one bounded call, never retries provider errors',async()=>{const fetcher=vi.fn(async()=>new Response('',{status:429}));expect(await collectWikinews('wikinews-tennis',fetcher,now)).toMatchObject({requests:1,status:'HTTP_429',candidates:[]});expect(fetcher).toHaveBeenCalledTimes(1);});
 it('reports an empty current cohort without manufacturing news',async()=>{const fetcher=vi.fn(async()=>Response.json({query:{pages:[]}}));expect(await collectWikinews('wikinews-hockey',fetcher,now)).toMatchObject({requests:1,status:'NO_CURRENT_VERIFIED_CANDIDATES'});});
 it('dispatches through the existing scheduled pipeline without an Owner script',async()=>{const fetcher=vi.fn(async()=>Response.json(data()));const source={sourceId:'wikinews-tennis',disabled:false,nextAllowedAt:now.toISOString(),lastAttemptAt:null,lastSuccessAt:null,failures:0,cursor:{},lastStatus:'not-run'};const result=await collectScheduledDiscovery(source,fetcher,now);expect(result.status).toBe('CANDIDATES_REQUIRE_REVIEW');expect(result.requests).toBe(1);expect(result.candidates).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(1);});
});
