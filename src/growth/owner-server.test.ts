import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {growthOwnerAction,growthOwnerStatus,type GrowthOwnerDependencies} from './owner-server';

const origin='https://livasports.com',access='z'.repeat(43);
const owner=()=>({cookie:`${ownerCookie}=${signOwnerSession(newOwnerSession())}`});
const db={query:vi.fn() as unknown as QueryExecutor['query'],transaction:vi.fn(),close:vi.fn()} as unknown as DatabaseClient;
function deps(over:Partial<GrowthOwnerDependencies>={}):GrowthOwnerDependencies{return {database:()=>db,dashboard:vi.fn(async()=>({generatedAt:'2026-09-22T12:00:00Z',social:[],content:[],items:[],considered:0,producible:0})),
  run:vi.fn<GrowthOwnerDependencies['run']>(async()=>({state:'SUCCEEDED',jobId:'11111111-1111-4111-8111-111111111111',considered:1,generated:1,skippedDuplicate:0,itemIds:[],providerRequests:0})),
  transition:vi.fn(async()=>true),regeneratePlatform:vi.fn<GrowthOwnerDependencies['regeneratePlatform']>(async()=>({state:'SUCCEEDED',jobId:'11111111-1111-4111-8111-111111111111',considered:1,generated:1,skippedDuplicate:0,itemIds:[],providerRequests:0})),...over};}
const get=(headers:HeadersInit={})=>new Request(origin+'/api/owner/growth',{headers});
const post=(body:unknown,headers:HeadersInit={})=>new Request(origin+'/api/owner/growth',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json',...Object.fromEntries(new Headers(headers))},body:JSON.stringify(body)});

beforeEach(()=>{vi.stubEnv('OWNER_QA_SESSION_SECRET','s'.repeat(43));vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash(access));vi.clearAllMocks();});
afterEach(()=>vi.unstubAllEnvs());

describe('Traffic Engine V1 owner control plane',()=>{
  it('keeps ranking, generation and mutation owner-only and no-store',async()=>{
    expect((await growthOwnerStatus(get(),deps())).status).toBe(401);expect((await growthOwnerAction(post({action:'refresh'}),deps())).status).toBe(401);
    const response=await growthOwnerStatus(get(owner()),deps());expect(response.status).toBe(200);expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await response.json()).toMatchObject({providerRequests:0});expect(db.close).toHaveBeenCalled();
  });
  it('rejects cross-origin, query-bearing and unknown action input',async()=>{
    const badOrigin=new Request(origin+'/api/owner/growth',{method:'POST',headers:{...owner(),origin:'https://evil.example','sec-fetch-site':'cross-site','content-type':'application/json'},body:'{"action":"refresh"}'});
    expect((await growthOwnerAction(badOrigin,deps())).status).toBe(403);
    expect((await growthOwnerAction(post({action:'delete-all'},owner()),deps())).status).toBe(400);
    expect((await growthOwnerAction(post({action:'refresh',sql:'DROP TABLE'},owner()),deps())).status).toBe(400);
  });
  it('supports refresh, deterministic regeneration and validated channel transitions',async()=>{
    const run=vi.fn<GrowthOwnerDependencies['run']>(async()=>({state:'SUCCEEDED',jobId:'11111111-1111-4111-8111-111111111111',considered:1,generated:1,skippedDuplicate:0,itemIds:[],providerRequests:0}));
    expect((await growthOwnerAction(post({action:'refresh'},owner()),deps({run}))).status).toBe(200);
    expect((await growthOwnerAction(post({action:'regenerate',fixtureId:'11111111-1111-4111-8111-111111111111'},owner()),deps({run}))).status).toBe(200);
    expect(run.mock.calls[1][2]).toEqual({forceFixtureId:'11111111-1111-4111-8111-111111111111'});
    const transition=vi.fn(async()=>true);
    const response=await growthOwnerAction(post({action:'transition',itemId:'22222222-2222-4222-8222-222222222222',channel:'TIKTOK',status:'APPROVED'},owner()),deps({transition}));
    expect(response.status).toBe(200);expect(transition).toHaveBeenCalledWith(db,'22222222-2222-4222-8222-222222222222','TIKTOK','APPROVED');
    expect((await growthOwnerAction(post({action:'transition',itemId:'bad',channel:'TIKTOK',status:'APPROVED'},owner()),deps())).status).toBe(400);
  });
  it('regenerates exactly one validated video platform through the owner control plane',async()=>{
    const regeneratePlatform=vi.fn<GrowthOwnerDependencies['regeneratePlatform']>(async()=>({state:'SUCCEEDED',jobId:'11111111-1111-4111-8111-111111111111',considered:1,generated:1,skippedDuplicate:0,itemIds:[],providerRequests:0}));
    const response=await growthOwnerAction(post({action:'regenerate-platform',itemId:'22222222-2222-4222-8222-222222222222',channel:'INSTAGRAM_REELS'},owner()),deps({regeneratePlatform}));
    expect(response.status).toBe(200);expect(regeneratePlatform).toHaveBeenCalledWith(db,'22222222-2222-4222-8222-222222222222','INSTAGRAM_REELS');
    expect((await growthOwnerAction(post({action:'regenerate-platform',itemId:'22222222-2222-4222-8222-222222222222',channel:'EDITORIAL'},owner()),deps())).status).toBe(400);
  });
  it('supports an owner-only non-persisting deployed render proof',async()=>{
    const preview=vi.fn<NonNullable<GrowthOwnerDependencies['preview']>>(async()=>({channel:'TIKTOK',status:'READY',mimeType:'video/mp4',sha256:'a'.repeat(64),byteLength:4,data:Buffer.from('mp4!'),voice:{mode:'ENERGETIC',provider:'elevenlabs',lines:5,degradedReason:null}}));
    const dependencies=deps({preview}),response=await growthOwnerAction(post({action:'preview',fixtureId:'11111111-1111-4111-8111-111111111111',channel:'TIKTOK'},owner()),dependencies);
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('video/mp4');expect(response.headers.get('x-growth-voice')).toBe('elevenlabs:5');
    expect(dependencies.run).not.toHaveBeenCalled();expect(dependencies.transition).not.toHaveBeenCalled();
    expect((await growthOwnerAction(post({action:'preview',fixtureId:'11111111-1111-4111-8111-111111111111',channel:'TIKTOK'}),dependencies)).status).toBe(401);
  });
});
