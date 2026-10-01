import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';

const mocked=vi.hoisted(()=>({snapshot:vi.fn(),persist:vi.fn(),startJob:vi.fn(),budget:{verified:true,rollingHeadroom:10},requests:0}));
vi.mock('@/providers/oddspapi/M5OddsPapiAdapter',()=>({M5OddsPapiAdapter:class{constructor(){mocked.requests=0;}requestCount(){return mocked.requests;}async snapshot(b:string,ids:string[]){mocked.requests++;return mocked.snapshot(b,ids);}}}));
vi.mock('@/providers/oddspapi/m5-normalizer',async importOriginal=>({...await importOriginal<typeof import('@/providers/oddspapi/m5-normalizer')>(),verifyCatalog:()=>undefined}));
vi.mock('../ingestion',()=>({startOddsJob:(...a:unknown[])=>mocked.startJob(...a),endOddsJob:async()=>undefined,persistSnapshot:(...a:unknown[])=>mocked.persist(...a)}));
vi.mock('../budget',async importOriginal=>({...await importOriginal<typeof import('../budget')>(),budgetHealth:async()=>mocked.budget}));
import {runTargetedRefresh,ownerActionRecentlyRan,TARGETED_REFRESH_MIN_INTERVAL_MINUTES} from './recovery';
import {OddsBudgetStopped} from '../budget';

const catalog=[{tournamentId:35,tournamentSlug:'bundesliga',categorySlug:'germany'},{tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'}];
function database(lastAttempt:Date|null){
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:catalog}],rowCount:1};
    if(sql.includes('max(last_attempt_at)'))return {rows:[{at:lastAttempt}],rowCount:1};
    if(sql.includes("trigger_source='OWNER'"))return {rows:[{at:new Date('2026-09-18T11:58:00Z')}],rowCount:1};
    return {rows:[],rowCount:0};
  });
  const typed=query as unknown as QueryExecutor['query'];
  return {db:{query:typed,transaction:async(w:(tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient,query};
}
const actions=(query:ReturnType<typeof vi.fn>)=>query.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO odds_recovery_actions')).map(c=>(c[1] as unknown[])[7]);
describe('P3 targeted refresh safety (§24, §29)',()=>{
  beforeEach(()=>{mocked.snapshot.mockReset();mocked.persist.mockReset();mocked.startJob.mockReset();mocked.budget={verified:true,rollingHeadroom:10};
    mocked.startJob.mockResolvedValue('job-1');mocked.snapshot.mockResolvedValue({observedAt:'2026-09-18T12:00:00Z',fixtures:[],quotes:[],tournamentIds:['35']});mocked.persist.mockResolvedValue({quotes:7,matchedFixtures:1,returnedFixtures:1,outcomes:[{outcome:'NATIVE_PERSISTED',meaningful:true}]});});
  it('rejects a competition without a verified target and records the rejection',async()=>{
    const {db,query}=database(null);
    const r=await runTargetedRefresh(db,'key','la-liga-2',{trigger:'OWNER',reason:'test'});
    expect(r).toMatchObject({ok:false,code:'TARGET_MISSING',requests:0});expect(mocked.snapshot).not.toHaveBeenCalled();expect(actions(query)).toEqual(['REJECTED_TARGET_MISSING']);
  });
  it('obeys the minimum interval, the live budget headroom and the concurrent-worker lock',async()=>{
    const now=new Date('2026-09-18T12:00:00Z');
    const {db:recent,query:q1}=database(new Date(now.getTime()-(TARGETED_REFRESH_MIN_INTERVAL_MINUTES-1)*60000));
    expect((await runTargetedRefresh(recent,'key','bundesliga',{trigger:'OWNER',reason:'test',now})).code).toBe('MIN_INTERVAL');expect(actions(q1)).toEqual(['REJECTED_MIN_INTERVAL']);
    mocked.budget={verified:true,rollingHeadroom:1};
    const {db:poor,query:q2}=database(null);
    expect((await runTargetedRefresh(poor,'key','bundesliga',{trigger:'OWNER',reason:'test',now})).code).toBe('BUDGET_HEADROOM');expect(actions(q2)).toEqual(['REJECTED_BUDGET']);
    mocked.budget={verified:true,rollingHeadroom:10};mocked.startJob.mockRejectedValueOnce(new Error('ODDS_WORKER_ALREADY_RUNNING'));
    const {db:busy,query:q3}=database(null);
    expect((await runTargetedRefresh(busy,'key','bundesliga',{trigger:'OWNER',reason:'test',now})).code).toBe('CONCURRENT_REFRESH');expect(actions(q3)).toEqual(['REJECTED_CONCURRENT']);
    expect(mocked.snapshot).not.toHaveBeenCalled();
  });
  it('refreshes exactly the target for all four feeds, verifies persistence and logs the action with the headroom after',async()=>{
    const {db,query}=database(null);
    const r=await runTargetedRefresh(db,'key','bundesliga',{trigger:'OWNER',reason:'owner test'});
    expect(r).toMatchObject({ok:true,code:'OK',tournamentId:'35',requestCost:4,requests:4});
    expect(mocked.snapshot.mock.calls.map(c=>c[1])).toEqual([['35'],['35'],['35'],['35']]);expect(mocked.persist).toHaveBeenCalledTimes(4);
    expect(actions(query)).toEqual(['SUCCEEDED']);
    expect(query.mock.calls.some(([sql])=>String(sql).includes("trigger_source='CONTROLLED'"))).toBe(true);
  });
  it('never calls a saved but unmapped response a successful owner refresh',async()=>{
    mocked.persist.mockResolvedValue({quotes:0,matchedFixtures:0,returnedFixtures:3,outcomes:[{outcome:'MAPPING_EMPTY',meaningful:false}]});
    const {db}=database(null);const r=await runTargetedRefresh(db,'key','bundesliga',{trigger:'OWNER',reason:'test'});
    expect(r.ok).toBe(false);expect(r.feeds.every(f=>f.outcome==='MAPPING_EMPTY')).toBe(true);
  });
  it('a ledger stop mid-way ends the refresh without touching the second bookmaker and reports PARTIAL_OR_FAILED',async()=>{
    mocked.snapshot.mockResolvedValueOnce({observedAt:'2026-09-18T12:00:00Z',fixtures:[],quotes:[],tournamentIds:['35']}).mockRejectedValueOnce(new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED'));
    const {db}=database(null);
    const r=await runTargetedRefresh(db,'key','bundesliga',{trigger:'SCHEDULER',reason:'test'});
    expect(r.ok).toBe(false);expect(r.feeds.map(f=>f.outcome)).toEqual(['SUCCEEDED','FAILED']);expect(r.feeds[1].error).toBe('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED');
  });
  it('platform-wide owner action rate limit reports the last run',async()=>{
    const {db}=database(null);
    expect(await ownerActionRecentlyRan(db,'TARGETED_REFRESH')).toBe('2026-09-18T11:58:00.000Z');
  });
  it('includes unsuccessful paid attempts in the durable target cooldown',async()=>{
    const {db,query}=database(new Date('2026-09-18T11:59:00Z'));
    const result=await runTargetedRefresh(db,'key','bundesliga',{trigger:'OWNER',reason:'test',now:new Date('2026-09-18T12:00:00Z')});
    expect(result.code).toBe('MIN_INTERVAL');
    const sql=String(query.mock.calls.find(([value])=>String(value).includes('greatest('))?.[0]);
    expect(sql).toContain('odds_recovery_actions');expect(sql).toContain('request_cost>0');
    expect(mocked.snapshot).not.toHaveBeenCalled();
  });
});
