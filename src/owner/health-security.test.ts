import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from './session';
import {ownerHealthAction,ownerHealthStatus,type OwnerHealthDependencies} from './health-server';
import {userSessionCookieName} from '@/auth/identity';
import {isPrivatePath,robotsDisallow,routePolicies} from '@/seo/policy';
import type {DatabaseClient} from '@/database/client';

const access='q'.repeat(43),origin='https://livasports.com';
const ownerHeaders=()=>({cookie:ownerCookie+'='+signOwnerSession({...newOwnerSession(),preview:false})});
const userHeaders=()=>({cookie:userSessionCookieName(true)+'=user-session-token-value'});
const get=(headers:HeadersInit={},path='/api/owner/health')=>new Request(origin+path,{headers});
const post=(body:unknown,headers:HeadersInit={},extra:Record<string,string>={})=>new Request(origin+'/api/owner/health',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json',...extra,...Object.fromEntries(new Headers(headers))},body:JSON.stringify(body)});
const closed=vi.fn();
function deps(over:Partial<OwnerHealthDependencies>={}):OwnerHealthDependencies{
  const db={query:vi.fn(),transaction:vi.fn(),close:closed} as unknown as DatabaseClient;
  return {database:()=>db,readHealth:async()=>({version:'p3.1',overall:'HEALTHY',competitions:[],incidents:[],providerCalls:'none'} as never),
    evaluate:async()=>({opened:0,resolved:0,alerts:[],overall:'HEALTHY'}),refresh:async(_db,competition)=>({ok:true,code:'OK',competition,requests:2,budgetHeadroomAfter:8}),
    recentOwnerRefresh:async()=>null,retryMapping:async()=>({total:1,mapped:1,unmatched:0,ambiguous:0}),acknowledge:async()=>true,providerKey:()=>'k',...over};
}
beforeEach(()=>{vi.stubEnv('VERCEL','1');vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash(access));closed.mockClear();});
afterEach(()=>{vi.unstubAllEnvs();});

describe('P3 owner control plane security (§15, §23, §31)',()=>{
  it('requires owner auth, confirmation and fixed-schema input for alert drills',async()=>{
    const testAlert=vi.fn(async()=>({ok:true,code:'SENT',providerRequests:0}));const body={action:'test-alert',runId:'11111111-1111-4111-8111-111111111111',phase:'OPENED',confirm:true};
    expect((await ownerHealthAction(post(body,userHeaders()),deps({testAlert}))).status).toBe(401);
    expect((await ownerHealthAction(post({...body,to:'injected@example.test'},ownerHeaders()),deps({testAlert}))).status).toBe(400);
    expect((await ownerHealthAction(post({...body,confirm:false},ownerHeaders()),deps({testAlert}))).status).toBe(400);
    expect((await ownerHealthAction(post(body,ownerHeaders()),deps({testAlert}))).status).toBe(200);expect(testAlert).toHaveBeenCalledTimes(1);
  });
  it('blocks the public and regular authenticated users, admits the owner session, and never leaks provider calls or secrets',async()=>{
    expect((await ownerHealthStatus(get(),deps())).status).toBe(401);
    expect((await ownerHealthStatus(get(userHeaders()),deps())).status).toBe(401);
    const ok=await ownerHealthStatus(get(ownerHeaders()),deps());
    expect(ok.status).toBe(200);const body=await ok.json();expect(body.providerRequests).toBe(0);expect(body.overall).toBe('HEALTHY');
    expect(ok.headers.get('x-robots-tag')).toBe('noindex, nofollow');expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.stringify(body)).not.toMatch(/apiKey|OWNER_QA|DATABASE_URL|CRON_SECRET/);
    expect(closed).toHaveBeenCalled();
    expect((await ownerHealthStatus(get(ownerHeaders(),'/api/owner/health?x=1'),deps())).status).toBe(400);
  });
  it('is unavailable when owner access is not configured',async()=>{
    const headers=ownerHeaders();vi.stubEnv('OWNER_QA_SESSION_SECRET','');
    expect((await ownerHealthStatus(get(headers),deps())).status).toBe(503);
    expect((await ownerHealthAction(post({action:'recheck'},headers),deps())).status).toBe(503);
  });
  it('manual actions require same-origin, HTTPS, JSON, the owner session and a known action',async()=>{
    expect((await ownerHealthAction(post({action:'recheck'},ownerHeaders(),{origin:'https://evil.example'}),deps())).status).toBe(403);
    expect((await ownerHealthAction(post({action:'recheck'},ownerHeaders(),{'sec-fetch-site':'cross-site'}),deps())).status).toBe(403);
    expect((await ownerHealthAction(new Request('http://livasports.com/api/owner/health',{method:'POST',headers:{origin:'http://livasports.com','sec-fetch-site':'same-origin','content-type':'application/json',...ownerHeaders()},body:'{}'}),deps())).status).toBe(403);
    expect((await ownerHealthAction(post({action:'recheck'},{},{}),deps())).status).toBe(401);
    expect((await ownerHealthAction(post({action:'recheck'},userHeaders()),deps())).status).toBe(401);
    expect((await ownerHealthAction(post({action:'drop-everything'},ownerHeaders()),deps())).status).toBe(400);
    expect((await ownerHealthAction(post({action:'recheck',sql:'DELETE'},ownerHeaders()),deps())).status).toBe(400);
    const ok=await ownerHealthAction(post({action:'recheck'},ownerHeaders()),deps());
    expect(ok.status).toBe(200);expect(await ok.json()).toMatchObject({action:'recheck',overall:'HEALTHY'});
  });
  it('a targeted refresh needs explicit confirmation, a valid competition, budget/provider readiness and is rate-limited platform-wide',async()=>{
    const refresh=vi.fn(async(_db:DatabaseClient,competition:string)=>({ok:true,code:'OK',competition,requests:2,budgetHeadroomAfter:8}));
    expect((await ownerHealthAction(post({action:'refresh-target',competition:'Bundesliga!'},ownerHeaders()),deps({refresh}))).status).toBe(400);
    const unconfirmed=await ownerHealthAction(post({action:'refresh-target',competition:'bundesliga'},ownerHeaders()),deps({refresh}));
    expect(unconfirmed.status).toBe(409);expect(await unconfirmed.json()).toEqual({error:'CONFIRMATION_REQUIRED',requestCost:2});
    expect((await ownerHealthAction(post({action:'refresh-target',competition:'bundesliga',confirm:true},ownerHeaders()),deps({refresh,providerKey:()=>null}))).status).toBe(503);
    const limited=await ownerHealthAction(post({action:'refresh-target',competition:'bundesliga',confirm:true},ownerHeaders()),deps({refresh,recentOwnerRefresh:async()=>'2026-09-18T11:58:00.000Z'}));
    expect(limited.status).toBe(429);expect(limited.headers.get('retry-after')).toBe('300');
    expect(refresh).not.toHaveBeenCalled();
    const ok=await ownerHealthAction(post({action:'refresh-target',competition:'bundesliga',confirm:true},ownerHeaders()),deps({refresh}));
    expect(ok.status).toBe(200);expect(await ok.json()).toMatchObject({action:'refresh-target',code:'OK',requests:2,evaluation:{overall:'HEALTHY'}});
    expect(refresh).toHaveBeenCalledTimes(1);expect(refresh.mock.calls[0][1]).toBe('bundesliga');
    const rejected=await ownerHealthAction(post({action:'refresh-target',competition:'bundesliga',confirm:true},ownerHeaders()),deps({refresh:async()=>({ok:false,code:'BUDGET_HEADROOM'})}));
    expect(rejected.status).toBe(409);
  });
  it('acknowledge validates the incident id; retry-mapping never calls the provider',async()=>{
    expect((await ownerHealthAction(post({action:'acknowledge',incidentId:'nope'},ownerHeaders()),deps())).status).toBe(400);
    const ack=await ownerHealthAction(post({action:'acknowledge',incidentId:'11111111-1111-4111-8111-111111111111'},ownerHeaders()),deps());
    expect(await ack.json()).toEqual({action:'acknowledge',acknowledged:true});
    const refresh=vi.fn();
    const mapping=await ownerHealthAction(post({action:'retry-mapping'},ownerHeaders()),deps({refresh}));
    expect(await mapping.json()).toMatchObject({action:'retry-mapping',mapped:1});expect(refresh).not.toHaveBeenCalled();
  });
  it('owner routes stay out of search: robots disallow, no sitemap, private path family',()=>{
    expect(robotsDisallow).toContain('/owner/');
    expect(routePolicies.owner).toMatchObject({indexable:false,sitemap:false,crawl:'disallow'});
    expect(isPrivatePath('/owner/health')).toBe(true);expect(isPrivatePath('/owner/health/bundesliga')).toBe(true);expect(isPrivatePath('/api/owner/health')).toBe(true);
  });
});
