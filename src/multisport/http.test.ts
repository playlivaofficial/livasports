import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {signOwnerSession,ownerCookie} from '@/owner/session';
import {sportsOwnerRequest} from './http';
import type {SportsRepository,SnapshotRecord,SnapshotMutation} from './repository';
import type {SportsSnapshot} from './model';

const clock=new Date('2026-10-19T12:00:00Z');
// Synthetic test-only signing material, never an application account or environment credential.
const testSecret='TEST_ONLY_NOT_A_DEPLOYMENT_SECRET_'.repeat(2);
function cookie(expiresAt=clock.getTime()+3600000){return `${ownerCookie}=${signOwnerSession({v:1,id:'a'.repeat(32),expiresAt,preview:false})}`;}
function draft():SportsSnapshot{return {schemaVersion:1,competitionId:'premier-league',sport:'football',season:'2026/27',stage:'League',sourceId:'openfootball',sourceUrl:'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json',observedAt:'2026-09-20',retrievedAt:clock.toISOString(),mode:'historical',entities:[{id:'test-a',name:'Test club A',kind:'club'},{id:'test-b',name:'Test club B',kind:'club'}],tables:[],events:[{id:'test-result',stage:'League',homeId:'test-a',awayId:'test-b',date:'2026-09-20',start:null,status:'completed',scores:{home:1,away:0}}]};}
function record():SnapshotRecord{return {key:'premier-league:2026/27',draft:draft(),published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};}
function dependencies(){
  const repo={listOwner:vi.fn(async()=>[record()]),refreshStatus:vi.fn(async()=>[]),mutate:vi.fn(async(input:SnapshotMutation)=>{void input;return record();})};
  const repositoryCall=vi.fn(async(work:(value:SportsRepository)=>Promise<unknown>)=>work(repo as unknown as SportsRepository));
  const withRepository=async<T>(work:(value:SportsRepository)=>Promise<T>):Promise<T>=>repositoryCall(work) as Promise<T>;
  return {repo,withRepository,repositoryCall,invalidate:vi.fn()};
}
function request(options:{method?:string;body?:unknown;raw?:string;url?:string;headers?:Record<string,string|null|undefined>}={}){
  const method=options.method??'POST',headers=new Headers({cookie:cookie(),origin:'https://livasports.com','sec-fetch-site':'same-origin','content-type':'application/json'});
  for(const [key,value] of Object.entries(options.headers??{})){if(value===null)headers.delete(key);else if(value!==undefined)headers.set(key,value);}
  return new Request(options.url??'https://livasports.com/api/owner/sports',{method,headers,...(method==='GET'||method==='HEAD'?{}:{body:options.raw??JSON.stringify(Object.hasOwn(options,'body')?options.body:{action:'create',key:'premier-league:2026/27',revision:0,draft:draft()})})});
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(clock);vi.stubEnv('OWNER_QA_SESSION_SECRET',testSecret);vi.stubEnv('OWNER_QA_ACCESS_HASH','a'.repeat(64));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

describe('Owner sports HTTP authentication and request boundary',()=>{
  it('rejects absent, tampered, expired and duplicate cookies before repository access',async()=>{
    const valid=cookie(),cases=[null,valid.slice(0,-1)+(valid.endsWith('a')?'b':'a'),cookie(clock.getTime()-1),`${valid}; ${valid}`];
    for(const value of cases){const deps=dependencies(),response=await sportsOwnerRequest(request({headers:{cookie:value}}),deps);expect(response.status).toBe(401);expect(await response.json()).toEqual({error:'UNAUTHORIZED'});expect(deps.repositoryCall).not.toHaveBeenCalled();}
  });
  it('returns only Owner records/status under private non-cacheable headers',async()=>{
    const deps=dependencies(),response=await sportsOwnerRequest(request({method:'GET'}),deps);expect(response.status).toBe(200);const body=await response.json();expect(body).toMatchObject({records:[record()],refresh:[]});expect(body.coverage).toHaveLength(64);expect(body.coverage.every((r:{entities:number})=>r.entities===0)).toBe(true);expect(JSON.stringify(body.coverage)).not.toContain('leaseToken');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(deps.repo.mutate).not.toHaveBeenCalled();
  });
  it('rejects query parameters, unsupported methods and wrong content types',async()=>{
    for(const options of [{url:'https://livasports.com/api/owner/sports?x=1',status:400},{method:'PUT',status:405},{headers:{'content-type':'text/plain'},status:400}]){const deps=dependencies(),response=await sportsOwnerRequest(request(options),deps);expect(response.status).toBe(options.status);expect(deps.repositoryCall).not.toHaveBeenCalled();}
  });
  it('rejects cross-origin, missing-origin, cross-site and non-HTTPS writes',async()=>{
    for(const options of [{headers:{origin:'https://evil.example'}},{headers:{origin:null}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'sec-fetch-site':null}},{url:'http://livasports.com/api/owner/sports',headers:{origin:'http://livasports.com'}}]){const deps=dependencies(),response=await sportsOwnerRequest(request(options),deps);expect(response.status).toBe(403);expect(deps.repositoryCall).not.toHaveBeenCalled();}
  });
  it('rejects invalid JSON, non-object envelopes and unknown mutation fields',async()=>{
    for(const options of [{raw:'not-json'},{body:null},{body:[]},{body:{action:'create',key:'premier-league:2026/27',revision:0,execute:'never'}},{body:{action:'delete',key:'premier-league:2026/27',revision:0}},{body:{action:'save',key:'premier-league:2026/27',revision:1.5}}]){const deps=dependencies(),response=await sportsOwnerRequest(request(options),deps);expect(response.status).toBe(400);expect(deps.repositoryCall).not.toHaveBeenCalled();}
  });
  it('enforces actual streamed body bytes, not an untrusted Content-Length',async()=>{
    const deps=dependencies(),response=await sportsOwnerRequest(request({raw:JSON.stringify({data:'x'.repeat(2000001)}),headers:{'content-length':'10'}}),deps);expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'INVALID_REQUEST'});expect(deps.repositoryCall).not.toHaveBeenCalled();
  });
  it('rejects an invalid or unapproved draft before touching storage',async()=>{
    const bad=draft();bad.sourceId='nba';const deps=dependencies(),response=await sportsOwnerRequest(request({body:{action:'create',key:'premier-league:2026/27',revision:0,draft:bad}}),deps);expect(response.status).toBe(400);const body=await response.json();expect(body.error).toBe('INVALID_SNAPSHOT');expect(body.errors.length).toBeLessThanOrEqual(12);expect(deps.repositoryCall).not.toHaveBeenCalled();
  });
});

describe('Owner sports HTTP review, optimistic revision and opaque errors',()=>{
  it('passes a validated import through unchanged but does not publish or invalidate it',async()=>{
    const input={action:'create' as const,key:'premier-league:2026/27',revision:0,draft:draft()},deps=dependencies(),response=await sportsOwnerRequest(request({body:input}),deps);expect(response.status).toBe(200);expect(deps.repo.mutate).toHaveBeenCalledWith(input);expect(deps.invalidate).not.toHaveBeenCalled();
  });
  it('requires an explicit source-review confirmation before calling the repository',async()=>{
    const deps=dependencies(),body={action:'review',key:'premier-league:2026/27',revision:3};const rejected=await sportsOwnerRequest(request({body}),deps);expect(rejected.status).toBe(400);expect(await rejected.json()).toEqual({error:'SOURCE_REVIEW_REQUIRED'});expect(deps.repo.mutate).not.toHaveBeenCalled();const accepted=await sportsOwnerRequest(request({body:{...body,confirmed:true}}),deps);expect(accepted.status).toBe(200);expect(deps.repo.mutate).toHaveBeenCalledWith({...body,confirmed:true});expect(deps.invalidate).not.toHaveBeenCalled();
  });
  it('returns revision/review conflicts without invalidating or masking them as successful writes',async()=>{
    for(const code of ['REVISION_CONFLICT','REVIEW_REQUIRED']){const deps=dependencies();deps.repo.mutate.mockRejectedValueOnce(new Error(code));const response=await sportsOwnerRequest(request({body:{action:'publish',key:'premier-league:2026/27',revision:7}}),deps);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:code});expect(deps.invalidate).not.toHaveBeenCalled();}
  });
  it('invalidates only successful publication or archive, keeping edit/review paths private',async()=>{
    for(const action of ['publish','archive'] as const){const deps=dependencies(),response=await sportsOwnerRequest(request({body:{action,key:'premier-league:2026/27',revision:1}}),deps);expect(response.status).toBe(200);expect(deps.invalidate).toHaveBeenCalledTimes(1);expect(deps.repo.mutate.mock.invocationCallOrder[0]).toBeLessThan(deps.invalidate.mock.invocationCallOrder[0]);}
  });
  it('maps allowlisted repository failures to safe statuses',async()=>{
    for(const [code,status] of [['NOT_FOUND',404],['INVALID_MUTATION',400],['INVALID_SNAPSHOT',400],['RATE_LIMITED',429]] as const){const deps=dependencies();deps.repo.mutate.mockRejectedValueOnce(new Error(code));const response=await sportsOwnerRequest(request({body:{action:'archive',key:'premier-league:2026/27',revision:1}}),deps);expect(response.status).toBe(status);expect(await response.json()).toEqual({error:code});}
  });
  it('never exposes signing material, cookies, SQL or raw storage errors',async()=>{
    const deps=dependencies(),testCookie=cookie();deps.repositoryCall.mockRejectedValueOnce(new Error(`SELECT private_value FROM accounts; ${testSecret}; ${testCookie}; postgres://synthetic-test-only`));const response=await sportsOwnerRequest(request({method:'GET'}),deps),body=await response.text();expect(response.status).toBe(503);expect(body).toBe('{"error":"SPORTS_STORAGE_UNAVAILABLE"}');expect(body).not.toContain(testSecret);expect(body).not.toContain(testCookie);expect(response.headers.get('set-cookie')).toBeNull();
  });
});
