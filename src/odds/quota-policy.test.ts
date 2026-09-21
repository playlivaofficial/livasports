import {describe,it,expect,vi} from 'vitest';
import {quotaPressure} from './quota-policy';
import {budgetCadence,planScheduler,type RefreshTarget} from './scheduler-policy';
import {reserveOddsRequest} from './budget';
import type {QueryExecutor} from '@/database/client';
const now=new Date('2026-09-21T08:00:00Z');
const fixture=(hours:number)=>({id:'test-only',kickoff:new Date(+now+hours*3600000).toISOString(),status:'SCHEDULED'});
const target=(id:string,hours:number):RefreshTarget=>({bookmaker:'betsson',tournamentId:id,publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:null,retryAfter:null,fixtures:[fixture(hours)]});
describe('P5 quota headroom and outage protection',()=>{
  it('warns at 70 percent, protects at 85 and stops at 90',()=>{
    expect(quotaPressure(69,100)).toMatchObject({state:'NORMAL',slowdown:1});
    expect(quotaPressure(70,100)).toMatchObject({state:'WARNING',slowdown:1.5});
    expect(quotaPressure(85,100)).toMatchObject({state:'PROTECTED',slowdown:4});
    expect(quotaPressure(90,100).state).toBe('STOPPED');
  });
  it('caps the average AND busiest forecast day at 75 percent for 34 competitions and four feeds',()=>{
    const targets=Array.from({length:34},(_,i)=>['betsson','sportingbet.bet.br','betboo.bet.br','betano.bet.br'].map(bookmaker=>({...target(String(1000+i),i*4+1),bookmaker}))).flat();
    const p=budgetCadence(targets,now,{verified:true,routineRemaining:2730,period_end:new Date(+now+10*86400000),dailyCap:273,rollingDay:0});
    expect(p.normalDailyTarget).toBe(204);
    expect(p.projectedDailyRequests).toBeLessThanOrEqual(204);expect(p.peakDailyRequests).toBeLessThanOrEqual(204);
    expect(p.reservePct).toBeGreaterThanOrEqual(25);
  });
  it('does not fetch not-yet-due stable companions or completed/distant fixtures',()=>{
    const p=planScheduler([target('325',1),{...target('17',1),lastSuccessAt:now.toISOString()},target('384',200),{...target('27464',2),fixtures:[{...fixture(2),status:'FINISHED'}]}],now);
    expect(p.batches.map(b=>b.tournamentIds)).toEqual([['325']]);
  });
  it.each([[true,79,false],[true,80,true],[false,89,false],[false,90,true]])('transaction guard routine=%s used=%s blocks=%s',async(routine,used,blocked)=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM odds_budget_baselines')?[{hard_limit:5000,consumed:3650,rolling_day:used,remaining_days:10}]:[],rowCount:sql.includes('UPDATE odds_sync_jobs')?1:0}));
    const attempt=reserveOddsRequest({query:query as unknown as QueryExecutor['query']},{id:'test',jobId:'test',endpoint:'/v4/odds-by-tournaments',query:{bookmaker:'betsson',tournamentIds:'325'},routine,unmetered:false});
    if(blocked)await expect(attempt).rejects.toThrow('BUDGET');else await attempt;
  });
  it('blocks upstream outage and duplicate/cached requests before a new ledger reservation',async()=>{
    for(const marker of ['http_status IN','string_to_array']){
      const query=vi.fn(async(sql:string)=>({rows:[{blocked:sql.includes(marker)}],rowCount:1}));
      await expect(reserveOddsRequest({query:query as unknown as QueryExecutor['query']},{id:'test',jobId:'test',endpoint:'/v4/odds-by-tournaments',query:{bookmaker:'betsson',tournamentIds:'325'},routine:true,unmetered:false})).rejects.toThrow('COOLDOWN');
      expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_provider_requests'))).toBe(false);
    }
  });
});
