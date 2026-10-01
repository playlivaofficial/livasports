import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./scheduler',()=>({runOddsScheduler:vi.fn(),schedulerHealth:vi.fn(),safeSchedulerError:vi.fn(()=>'')}));
vi.mock('@/database/client',()=>({databaseUrl:()=>'unused-test-database',PostgresDatabaseClient:class{query(){return {rows:[],rowCount:0};}transaction(){}close(){}}}));
vi.mock('@/ingestion/score-ticker',()=>({runScoreTicker:vi.fn(async()=>({state:'NOT_DUE',providerRequests:0}))}));
vi.mock('@/ingestion/fixture-ticker',()=>({runFixtureTicker:vi.fn(async()=>({state:'NOT_DUE',providerRequests:0}))}));
import {authorizedScheduler,schedulerResponse} from './scheduler-server';
import {runOddsScheduler} from './scheduler';
import {runFixtureTicker} from '@/ingestion/fixture-ticker';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('protected scheduler boundary',()=>{
  const secret='unit-test-only-not-a-real-secret-value';
  const auth={headers:{Authorization:`Bearer ${secret}`}};
  const noWork:{jobId:string;trigger:'AUTOMATIC'|'CONTROLLED';state:'SUCCEEDED';controlPlaneState:'SUCCEEDED';dataPlaneState:'HEALTHY';requests:number;recovered:number;catalogExpanded:boolean;feeds:Record<string,unknown>[];error:null;nextDueAt:null;pacing:null;integrity:never[];reliability:null}=
    {jobId:'test-job',trigger:'AUTOMATIC',state:'SUCCEEDED',controlPlaneState:'SUCCEEDED',dataPlaneState:'HEALTHY',requests:0,recovered:0,catalogExpanded:false,feeds:[],error:null,nextDueAt:null,pacing:null,integrity:[],reliability:null};
  it('rejects missing, short and incorrect secrets before database/provider work',async()=>{
    expect(authorizedScheduler(new Request('https://example.test'),secret)).toBe(false);
    const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh'));
    expect(response.status).toBe(401);expect(runOddsScheduler).not.toHaveBeenCalled();
  });
  it('requires explicit activation for automatic invocation; public or query-supplied tokens do not work',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','false');
    const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',auth));
    expect(response.status).toBe(503);expect(runOddsScheduler).not.toHaveBeenCalled();
    expect((await schedulerResponse(new Request('https://example.test?token=test'))).status).toBe(401);
  });
  it('denies production DB mutation from Preview even with the scheduler secret',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('VERCEL_ENV','preview');
    expect((await schedulerResponse(new Request('https://example.test',{method:'POST',...auth}))).status).toBe(403);
    expect(runOddsScheduler).not.toHaveBeenCalled();
  });
  it('labels an activated GET as AUTOMATIC and treats a no-work success as healthy',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','true');vi.stubEnv('VERCEL_ENV','production');
    vi.mocked(runOddsScheduler).mockResolvedValue(noWork);
    const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',auth));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:'SUCCEEDED',requests:0,trigger:'AUTOMATIC'});
    expect(runOddsScheduler).toHaveBeenCalledWith(expect.anything(),undefined,'AUTOMATIC');
  });
  it('labels authenticated POST as CONTROLLED rather than automatic',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','true');vi.stubEnv('VERCEL_ENV','production');
    vi.mocked(runOddsScheduler).mockResolvedValue({...noWork,trigger:'CONTROLLED'});
    await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',{method:'POST',...auth}));
    expect(runOddsScheduler).toHaveBeenCalledWith(expect.anything(),undefined,'CONTROLLED');
  });
  it('answers 200 for a completed tick in every refresh state so the external cron never disables itself (production stall 2026-09-21)',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','true');vi.stubEnv('VERCEL_ENV','production');
    for(const state of ['FAILED','BUDGET_STOPPED','PARTIAL'] as const){
      vi.mocked(runOddsScheduler).mockResolvedValue({...noWork,state:state as never,error:'ODDS_REFRESH_FAILED' as never});
      const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',auth));
      expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state,fixtures:{state:'NOT_DUE'},scores:{state:'NOT_DUE'}});
    }
    expect(runFixtureTicker).toHaveBeenCalled();
  });
  it('still reports a worker overlap as 409 and infrastructure failure as 503',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','true');vi.stubEnv('VERCEL_ENV','production');
    vi.mocked(runOddsScheduler).mockRejectedValueOnce(new Error('ODDS_WORKER_ALREADY_RUNNING'));
    const {safeSchedulerError}=await import('./scheduler');vi.mocked(safeSchedulerError).mockReturnValueOnce('ODDS_WORKER_ALREADY_RUNNING');
    expect((await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',auth))).status).toBe(409);
    vi.mocked(runOddsScheduler).mockRejectedValueOnce(new Error('ODDS_DATABASE_UNAVAILABLE'));vi.mocked(safeSchedulerError).mockReturnValueOnce('ODDS_DATABASE_UNAVAILABLE');
    expect((await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',auth))).status).toBe(503);
  });
});
