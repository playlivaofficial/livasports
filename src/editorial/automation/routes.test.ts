import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({owner:vi.fn(),withRepository:vi.fn(),run:vi.fn(),invalidate:vi.fn(),control:vi.fn(),dashboard:vi.fn()}));
vi.mock('@/owner/session',()=>({requestOwnerSession:mocks.owner}));
vi.mock('./server',()=>({withAutomation:mocks.withRepository}));
vi.mock('./runner',()=>({runNewsAutomation:mocks.run}));
vi.mock('../invalidate',()=>({invalidateNews:mocks.invalidate}));
import {GET as scheduled} from '@/app/api/internal/editorial/news-cycle/route';
import {GET as ownerGet,POST as ownerPost} from '@/app/api/owner/news/automation/route';
const origin='http://localhost:3351';
const cron=(suffix='')=>new Request(origin+'/api/internal/editorial/news-cycle'+suffix,{headers:{Authorization:'Bearer synthetic-cron-test'}});
const control=(body:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/owner/news/automation',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('CRON_SECRET','synthetic-cron-test');vi.stubEnv('OPENAI_API_KEY','synthetic-model-test');vi.stubEnv('V3_NEWS_AUTOMATION_ENABLED','true');vi.stubEnv('V3_NEWS_MODEL_ENABLED','true');vi.stubEnv('V3_NEWS_BUDGET_MODE','validation');
 mocks.owner.mockReturnValue(true);mocks.dashboard.mockResolvedValue({paused:true});mocks.control.mockResolvedValue(undefined);mocks.withRepository.mockImplementation(work=>work({control:mocks.control,dashboard:mocks.dashboard}));mocks.run.mockResolvedValue({status:'completed',requests:0,published:[],changed:false});
});
afterEach(()=>vi.unstubAllEnvs());
describe('autonomous newsroom private route boundaries',()=>{
 it('returns a failed scheduler status for model failure rather than successful completion',async()=>{mocks.run.mockResolvedValue({status:'failed',generation:'MODEL_QUOTA_EXCEEDED',changed:false,published:[]});expect((await scheduled(cron())).status).toBe(503);expect(mocks.invalidate).not.toHaveBeenCalled();});
 it('blocks unauthenticated cron before storage or provider work',async()=>{expect((await scheduled(new Request(origin+'/api/internal/editorial/news-cycle'))).status).toBe(401);expect(mocks.run).not.toHaveBeenCalled();});
 it('rejects query controls',async()=>{expect((await scheduled(cron('?force=1'))).status).toBe(400);expect(mocks.run).not.toHaveBeenCalled();});
 it('fails closed before storage when a one-off scope is malformed',async()=>{vi.stubEnv('V3_NEWS_CANARY','{}');expect((await scheduled(cron())).status).toBe(503);expect(mocks.withRepository).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();});
 it('a scoped canary retains the lifetime validation ceiling even with production budget mode',async()=>{
  const scope={id:'synthetic-authorization',sourceId:'openliga-results',eventKey:'bundesliga:synthetic',fingerprint:'a'.repeat(64),notBefore:'2026-10-27T23:00:00Z',expiresAt:'2026-10-28T00:00:00Z',priorReservedMicroUsd:180000};
  vi.stubEnv('V3_NEWS_CANARY',JSON.stringify(scope));vi.stubEnv('V3_NEWS_BUDGET_MODE','production');await scheduled(cron());
  expect(mocks.withRepository.mock.calls[0][1]).toEqual(scope);expect(mocks.run.mock.calls[0][1].validationOnly).toBe(true);
 });
 it('stays disabled without deployment approval',async()=>{vi.stubEnv('V3_NEWS_AUTOMATION_ENABLED','false');expect(await (await scheduled(cron())).json()).toEqual({status:'disabled',requests:0});expect(mocks.run).not.toHaveBeenCalled();});
 it('does not pass a model credential while model execution is off',async()=>{vi.stubEnv('V3_NEWS_MODEL_ENABLED','false');await scheduled(cron());expect(mocks.run.mock.calls[0][1]).toEqual({key:undefined,validationOnly:true});});
 it('defaults to validation budget and never returns credentials',async()=>{vi.stubEnv('V3_NEWS_BUDGET_MODE','');const response=await scheduled(cron());expect(mocks.run.mock.calls[0][1].validationOnly).toBe(true);expect(await response.text()).not.toMatch(/synthetic-cron-test|synthetic-model-test|Authorization/);expect(response.headers.get('cache-control')).toContain('no-store');});
 it('invalidates every public placement on publication or correction only',async()=>{await scheduled(cron());expect(mocks.invalidate).not.toHaveBeenCalled();mocks.run.mockResolvedValue({status:'completed',changed:true,published:['safe-slug']});await scheduled(cron());expect(mocks.invalidate).toHaveBeenCalledTimes(1);});
 it('sanitizes storage exceptions',async()=>{mocks.withRepository.mockRejectedValue(new Error('synthetic-private-connection-details'));const response=await scheduled(cron());expect(response.status).toBe(503);expect(await response.text()).not.toContain('synthetic-private');});
 it.each(['GET','POST'])('blocks anonymous Owner %s',async method=>{mocks.owner.mockReturnValue(false);const response=await (method==='GET'?ownerGet(new Request(origin+'/api/owner/news/automation')):ownerPost(control({paused:false})));expect(response.status).toBe(401);expect(mocks.withRepository).not.toHaveBeenCalled();});
 it('rejects cross-origin and unbounded control fields',async()=>{expect((await ownerPost(control({paused:false},{Origin:'https://outside.invalid'}))).status).toBe(403);expect((await ownerPost(control({paused:false,key:'synthetic'}))).status).toBe(400);expect(mocks.control).not.toHaveBeenCalled();});
 it('accepts an authenticated same-origin emergency pause',async()=>{expect((await ownerPost(control({paused:true}))).status).toBe(200);expect(mocks.control).toHaveBeenCalledWith({paused:true});});
 it('reports only model configuration booleans to the Owner',async()=>{const response=await ownerGet(new Request(origin+'/api/owner/news/automation'));const text=await response.text();expect(text).toContain('"modelConfigured":true');expect(text).not.toMatch(/synthetic-model-test|synthetic-cron-test/);});
});
