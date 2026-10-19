import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class{}}));
vi.mock('./service',()=>({runGrowthSelection:vi.fn()}));
vi.mock('./discovery-refresh',()=>({refreshGrowthDiscovery:vi.fn()}));
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {authorizedScheduler} from '@/odds/scheduler-server';
import {growthSchedulerResponse} from './scheduler-server';
import {runGrowthSelection} from './service';
import {refreshGrowthDiscovery} from './discovery-refresh';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','s'.repeat(32));vi.stubEnv('VERCEL_ENV','production');});

describe('Traffic Engine V1 automatic generation',()=>{
  it('has no deployed V2 sports schedule; historical service remains archived',()=>{
    const config=JSON.parse(readFileSync(resolve(process.cwd(),'vercel.json'),'utf8')) as {crons:Array<{path:string;schedule:string}>};
    expect(config.crons).toEqual([]);
  });
  it('reuses the protected cron bearer boundary',()=>{
    expect(authorizedScheduler(new Request('https://livasports.com/api/internal/growth-refresh',{headers:{authorization:'Bearer '+ 's'.repeat(32)}}),'s'.repeat(32))).toBe(true);
    expect(authorizedScheduler(new Request('https://livasports.com/api/internal/growth-refresh'))).toBe(false);
  });
  it('a real GET scheduler boundary always performs automatic ranking and discovery refresh without owner session',async()=>{
    vi.mocked(runGrowthSelection).mockResolvedValue({state:'SUCCEEDED',jobId:null,considered:300,generated:0,skippedDuplicate:0,itemIds:[],providerRequests:0});
    vi.mocked(refreshGrowthDiscovery).mockResolvedValue({runs:3,paths:40});
    const response=await growthSchedulerResponse(new Request('https://livasports.com/api/internal/growth-refresh',{headers:{authorization:'Bearer '+'s'.repeat(32)}}));
    expect(response.status).toBe(200);expect(runGrowthSelection).toHaveBeenCalledWith(expect.anything(),'AUTOMATIC');
    expect(await response.json()).toMatchObject({providerRequests:0,discovery:{runs:3,paths:40}});
  });
  it('reports a cache failure for automatic recovery instead of falsely reporting success',async()=>{
    vi.mocked(runGrowthSelection).mockResolvedValue({state:'SUCCEEDED'} as never);vi.mocked(refreshGrowthDiscovery).mockRejectedValue(Error('CACHE_FAILED'));
    const response=await growthSchedulerResponse(new Request('https://livasports.com/api/internal/growth-refresh',{headers:{authorization:'Bearer '+'s'.repeat(32)}}));
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({providerRequests:0});
  });
  it('blocks unauthenticated and preview execution before ranking or invalidation',async()=>{
    expect((await growthSchedulerResponse(new Request('https://livasports.com/api/internal/growth-refresh'))).status).toBe(401);
    vi.stubEnv('VERCEL_ENV','preview');expect((await growthSchedulerResponse(new Request('https://livasports.com/api/internal/growth-refresh',{headers:{authorization:'Bearer '+'s'.repeat(32)}}))).status).toBe(403);
    expect(runGrowthSelection).not.toHaveBeenCalled();expect(refreshGrowthDiscovery).not.toHaveBeenCalled();
  });
});
