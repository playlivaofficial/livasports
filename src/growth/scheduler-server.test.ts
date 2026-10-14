import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {authorizedScheduler} from '@/odds/scheduler-server';

describe('Traffic Engine V1 automatic generation',()=>{
  it('checks hourly for GEO-local daily rotation and invalid slots, independently of the odds ticks',()=>{
    const config=JSON.parse(readFileSync(resolve(process.cwd(),'vercel.json'),'utf8')) as {crons:Array<{path:string;schedule:string}>};
    expect(config.crons).toContainEqual({path:'/api/internal/growth-refresh',schedule:'17 * * * *'});
    expect(config.crons.filter(cron=>cron.path==='/api/internal/growth-refresh')).toHaveLength(1);
    expect(config.crons).toContainEqual({path:'/api/internal/odds-refresh',schedule:'*/5 * * * *'});
  });
  it('reuses the protected cron bearer boundary',()=>{
    expect(authorizedScheduler(new Request('https://livasports.com/api/internal/growth-refresh',{headers:{authorization:'Bearer '+ 's'.repeat(32)}}),'s'.repeat(32))).toBe(true);
    expect(authorizedScheduler(new Request('https://livasports.com/api/internal/growth-refresh'))).toBe(false);
  });
});
