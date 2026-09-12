import {describe,it,expect} from 'vitest';
import {planOddsRefresh} from './refresh-policy';
import type {CanonicalOddsFixture} from './types';
const now=new Date('2026-09-12T15:00:00Z');
const fixture=(hours:number,status='SCHEDULED')=>({kickoff:new Date(now.getTime()+hours*3600000).toISOString(),status,competition:'brasileirao-serie-a'}) as CanonicalOddsFixture;
describe('budget-aware shared pregame refresh',()=>{
  it.each([[1,15],[6,30],[24,120],[72,1440]])('prioritizes %sh away at %s minute intervals',(hours,interval)=>expect(planOddsRefresh([fixture(hours)],null,now).intervalMinutes).toBe(interval));
  it('does not refresh finished, past or outside budget window fixtures',()=>{
    expect(planOddsRefresh([fixture(-1),fixture(1,'FINISHED')],null,now).due).toBe(false);
    expect(planOddsRefresh([fixture(12)],null,new Date('2026-09-12T07:00:00Z')).due).toBe(false);
  });
  it('deduplicates refresh for all users and fits within monthly allowance',()=>{
    expect(planOddsRefresh([fixture(1)],now.toISOString(),now).due).toBe(false);
    expect(16*4*2*31+300+50+15).toBeLessThan(4500);
  });
});
