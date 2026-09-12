import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./scheduler',()=>({runOddsScheduler:vi.fn(),schedulerHealth:vi.fn(),safeSchedulerError:()=>''}));
import {authorizedScheduler,schedulerResponse} from './scheduler-server';
import {runOddsScheduler} from './scheduler';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('protected scheduler boundary',()=>{
  const secret='unit-test-only-not-a-real-secret-value';
  it('rejects missing, short and incorrect secrets before database/provider work',async()=>{
    expect(authorizedScheduler(new Request('https://example.test'),secret)).toBe(false);
    const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh'));
    expect(response.status).toBe(401);expect(runOddsScheduler).not.toHaveBeenCalled();
  });
  it('requires explicit activation for automatic invocation; public or query-supplied tokens do not work',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('ODDS_AUTOMATION_ENABLED','false');
    const response=await schedulerResponse(new Request('https://example.test/api/internal/odds-refresh',{headers:{Authorization:`Bearer ${secret}`}}));
    expect(response.status).toBe(503);expect(runOddsScheduler).not.toHaveBeenCalled();
    expect((await schedulerResponse(new Request('https://example.test?token=test'))).status).toBe(401);
  });
  it('denies production DB mutation from Preview even with the scheduler secret',async()=>{
    vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('VERCEL_ENV','preview');
    expect((await schedulerResponse(new Request('https://example.test',{method:'POST',headers:{Authorization:`Bearer ${secret}`}}))).status).toBe(403);
    expect(runOddsScheduler).not.toHaveBeenCalled();
  });
});
