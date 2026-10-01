import {describe,it,expect,vi} from 'vitest';
import {verifiedAccountPeriod,reserveOddsRequest,reconcileAccountPeriod,budgetHealth,budgetGovernor,routineDailyCap} from './budget';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
const account={subscriptions:[{is_active:true,valid_from:'2026-09-02T11:10:51Z',valid_until:'2026-10-02T11:10:51Z',request_limit:5000,request_count:65,
  sport_ids:[10,11],bookmakers:{'sportingbet.bet.br':{has_live_odds:false,has_player_props:false},'1xbet':{has_live_odds:false,has_player_props:false},'betano.bet.br':{has_live_odds:false,has_player_props:false},betsson:{has_live_odds:false,has_player_props:false}}}]};
const input={id:'request',jobId:'job',endpoint:'/v4/odds-by-tournaments',query:{bookmaker:'betsson'},routine:true,unmetered:false};
function transaction(rows:unknown[]){const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM odds_budget_baselines')?rows:[],rowCount:sql.includes('UPDATE odds_sync_jobs')?1:0}));return {query:query as unknown as QueryExecutor['query'],mock:query};}
describe('durable subscription request budget',()=>{
  it('does not reset on the first of a calendar month',()=>{
    expect(verifiedAccountPeriod(account,new Date('2026-10-01T00:00:00Z'))).toMatchObject({start:'2026-09-02T11:10:51.000Z',end:'2026-10-02T11:10:51.000Z',used:65});
  });
  it('fails closed at the actual reset until a new explicit current period is verified',()=>{
    expect(()=>verifiedAccountPeriod(account,new Date('2026-10-02T11:10:51Z'))).toThrow('UNVERIFIED');
    expect(()=>verifiedAccountPeriod({subscriptions:[{...account.subscriptions[0],valid_until:null}]},new Date('2026-09-15'))).toThrow('UNVERIFIED');
  });
  it('rejects unlimited periods, unknown counters and live/props scope drift',()=>{
    for(const changed of [{request_count:null},{request_count:-1},{request_limit:10000},{valid_until:'2027-01-01T00:00:00Z'},{bookmakers:{}}])
      expect(()=>verifiedAccountPeriod({subscriptions:[{...account.subscriptions[0],...changed}]},new Date('2026-09-15'))).toThrow();
  });
  it.each([[4650,0],[200,4450],[4750,0]])('stops routine calls at %s/%s without inserting a reservation',async(consumed,rolling_day)=>{
    const tx=transaction([{hard_limit:5000,consumed,rolling_day}]);await expect(reserveOddsRequest(tx,input)).rejects.toMatchObject({name:'OddsBudgetStopped'});
    expect(tx.mock.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_provider_requests'))).toBe(false);
  });
  it('paces against the remaining actual subscription period before reaching the daily burst ceiling',async()=>{
    const tx=transaction([{hard_limit:5000,consumed:3000,rolling_day:165,remaining_days:10}]);
    await expect(reserveOddsRequest(tx,input)).rejects.toMatchObject({name:'OddsBudgetStopped'});
    expect(tx.mock.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_provider_requests'))).toBe(false);
  });
  it('holds a budget lock and reserves before any provider fetch; unmetered account alone can reconcile after exhaustion',async()=>{
    const tx=transaction([{hard_limit:5000,consumed:50,rolling_day:1}]);await reserveOddsRequest(tx,input);
    expect(tx.mock.mock.calls[0][0]).toContain('pg_advisory_xact_lock');expect(tx.mock.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_provider_requests'))).toBe(true);
    expect(tx.mock.mock.calls.at(-1)?.[0]).toContain('last_attempt_at');
    const expired=transaction([]);await reserveOddsRequest(expired,{...input,unmetered:true,endpoint:'/v4/account'});
    expect(expired.mock.mock.calls.some(([sql])=>sql.includes('FROM odds_budget_baselines'))).toBe(false);
  });
  it('never lowers the external floor on reconciliation or creates an overlapping period',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));const typed=query as unknown as QueryExecutor['query'];
    const db:DatabaseClient={query:typed,transaction:async work=>work({query:typed}),close:async()=>{}};
    await reconcileAccountPeriod(db,verifiedAccountPeriod(account,new Date('2026-09-15')));
    const sql=(query.mock.calls as unknown as string[][]).at(-1)![0];expect(sql).toContain('GREATEST(odds_budget_baselines.externally_consumed');expect(sql).toContain('WHERE billable');
  });
  it('mirrors the ledger daily ceiling and exposes rolling-day headroom for scheduler pacing (P0 incident)',async()=>{
    expect(routineDailyCap(2970,14.1)).toBe(210);expect(routineDailyCap(4000,1)).toBe(4000);expect(routineDailyCap(0,10)).toBe(1);expect(routineDailyCap(500,0.2)).toBe(500);
    const query=vi.fn(async()=>({rows:[{period_start:'2026-09-02T11:10:51Z',period_end:new Date(Date.now()+14.1*86400000),hard_limit:5000,externally_consumed:50,local_counted:980,
      reserved:0,completed:980,failed_counted:88,unmetered_calls:6,rolling_day:209}],rowCount:1}));
    const health=await budgetHealth({query:query as unknown as QueryExecutor['query']});
    expect(health).toMatchObject({verified:true,used:1030,routineRemaining:3620,dailyCap:256,rollingDay:209,rollingHeadroom:21});
    expect(String((query.mock.calls as unknown as string[][])[0][0])).toContain("d.billable AND d.started_at>now()-interval '24 hours'");
  });
  it('P3 budget governor derives reserves, projections and pressure from the verified period only (§8)',()=>{
    const g=budgetGovernor({used:1030,routineRemaining:2970,remainingDays:14.1,rollingDay:209,dailyCap:210,rollingThreeDays:600,hardLimit:5000});
    expect(g).toMatchObject({periodAllowance:4750,routineAllowance:4650,remaining:3720,headroom:1,urgentReserve:42,recoveryReserve:21,discoveryReserve:2,routineCeiling:168,routineHeadroom:0,projectedDailyRequests:200,pressure:'RESERVE_ONLY'});
    expect(g.projectedEndOfPeriodUsage).toBe(Math.round(1030+200*14.1));expect(g.projectedOverrun).toBe(false);
    expect(budgetGovernor({used:1030,routineRemaining:2970,remainingDays:14.1,rollingDay:100,dailyCap:210,rollingThreeDays:300,hardLimit:5000}).pressure).toBe('NORMAL');
    expect(budgetGovernor({used:1030,routineRemaining:2970,remainingDays:14.1,rollingDay:150,dailyCap:210,rollingThreeDays:300,hardLimit:5000}).pressure).toBe('PACED');
    expect(budgetGovernor({used:4000,routineRemaining:0,remainingDays:3,rollingDay:0,dailyCap:1,rollingThreeDays:900,hardLimit:5000})).toMatchObject({pressure:'EXHAUSTED',projectedOverrun:true});
  });
});
