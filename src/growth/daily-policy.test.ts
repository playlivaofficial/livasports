import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {growthLocalDay,nextGrowthCheck} from './daily-policy';
import {dailyGeoNeedsRanking} from './daily-repository';
import type {QueryExecutor} from '@/database/client';
describe('independent daily cycles and hourly replacement',()=>{
 it('uses the correct local date on each side of the Mexico/Andean midnight boundary',()=>{
  const now=new Date('2026-10-14T05:30:00Z');expect(growthLocalDay('MX',now)).toBe('2026-10-13');expect(growthLocalDay('CO',now)).toBe('2026-10-14');expect(growthLocalDay('PE',now)).toBe('2026-10-14');
 });
 it('always reports the next hourly check strictly after now',()=>{
  expect(nextGrowthCheck(new Date('2026-10-14T06:16:00Z'))).toBe('2026-10-14T06:17:00.000Z');expect(nextGrowthCheck(new Date('2026-10-14T06:17:00Z'))).toBe('2026-10-14T07:17:00.000Z');
 });
 it('can reuse a same-local-day successful valid five without making a write',async()=>{
  const query=vi.fn(async()=>({rows:[{id:'1'}]}));expect(await dailyGeoNeedsRanking({query} as unknown as QueryExecutor,'CO',new Date('2026-10-14T06:00:00Z'))).toBe(false);
  const [sql]=query.mock.calls[0] as unknown as [string];expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);expect(sql).toContain("f.status='SCHEDULED'");expect(sql).toContain('f.kickoff>$4');expect(sql).toContain('sports_pending_fixtures');
 });
 it('re-ranks whenever the success/day/version/valid-five guard does not match',async()=>{
  const query=vi.fn(async()=>({rows:[]}));expect(await dailyGeoNeedsRanking({query} as unknown as QueryExecutor,'PE',new Date('2026-10-14T06:00:00Z'))).toBe(true);
 });
});
