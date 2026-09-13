import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {OddsBudgetStopped} from './budget';
const mocked=vi.hoisted(()=>({snapshot:vi.fn(),persist:vi.fn(),start:vi.fn(),account:vi.fn()}));
vi.mock('@/providers/oddspapi/M5OddsPapiAdapter',()=>({M5OddsPapiAdapter:class {snapshot=mocked.snapshot;accountPeriod=mocked.account;requestCount(){return mocked.snapshot.mock.calls.length;}}}));
vi.mock('@/providers/oddspapi/m5-normalizer',()=>({M5_TOURNAMENTS:[{id:'325',canonical:'brasileirao-serie-a'}],verifyCatalog:vi.fn()}));
vi.mock('./ingestion',()=>({startOddsJob:mocked.start,persistSnapshot:mocked.persist,canonicalFixtures:async()=>[{id:'test-only',competition:'brasileirao-serie-a',status:'SCHEDULED',kickoff:new Date(Date.now()+3600000).toISOString()}]}));
import {runOddsScheduler,safeSchedulerError} from './scheduler';
function database(){const query=vi.fn(async(sql:string)=>{
  if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:[]}],rowCount:1};
  if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].map(provider_slug=>({provider_slug,tournament_id:'325',public_eligible:true,useful_coverage:true,last_success_at:null})),rowCount:2};
  if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
  return {rows:[],rowCount:0};});const typed=query as unknown as QueryExecutor['query'];
  const db:DatabaseClient={query:typed,transaction:async w=>w({query:typed}),close:async()=>{}};return {db,query};
}
beforeEach(()=>{vi.clearAllMocks();mocked.start.mockResolvedValue('test-job');mocked.persist.mockResolvedValue({returnedFixtures:1,matchedFixtures:1,quotes:3,history_changes:0,current_writes:3,closed:0});});
describe('scheduler independent failure and durable completion',()=>{
  it('preserves the successful second feed when the first fails; records PARTIAL with a sanitized code',async()=>{
    mocked.snapshot.mockRejectedValueOnce(new Error('private upstream error')).mockResolvedValueOnce({observedAt:new Date().toISOString()});
    const {db,query}=database();const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('PARTIAL');expect(result.feeds).toHaveLength(1);expect(mocked.persist).toHaveBeenCalledTimes(1);
    expect(result.error).toBe('ODDS_REFRESH_FAILED');expect(query.mock.calls.some(([s])=>s.includes('retry_after=now()+LEAST'))).toBe(true);
  });
  it('ends as BUDGET_STOPPED, not an uncontrolled retry or a false success',async()=>{
    mocked.snapshot.mockRejectedValue(new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED'));
    const result=await runOddsScheduler(database().db,'test-only');expect(result.state).toBe('BUDGET_STOPPED');
    expect(mocked.snapshot).toHaveBeenCalledTimes(1);expect(mocked.persist).not.toHaveBeenCalled();
  });
  it('never calls a provider when another lease owns the batch',async()=>{
    mocked.start.mockRejectedValueOnce(new Error('ODDS_WORKER_ALREADY_RUNNING'));
    await expect(runOddsScheduler(database().db,'test-only')).rejects.toThrow('ALREADY_RUNNING');expect(mocked.snapshot).not.toHaveBeenCalled();
  });
  it('completes a no-work tick as SUCCEEDED with zero provider calls when nothing is due',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:[]}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].map(provider_slug=>({
        provider_slug,tournament_id:'325',public_eligible:true,useful_coverage:true,last_success_at:new Date()}))};
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const idle={query:typed,transaction:async w=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    const result=await runOddsScheduler(idle,'test-only','AUTOMATIC');
    expect(result).toMatchObject({state:'SUCCEEDED',requests:0,trigger:'AUTOMATIC',feeds:[]});
    expect(mocked.snapshot).not.toHaveBeenCalled();expect(mocked.account).not.toHaveBeenCalled();
  });
  it('never persists provider response bodies or arbitrary error messages into health',()=>{
    expect(safeSchedulerError(new Error(JSON.stringify({status:400,message:'private'})))).toBe('ODDSPAPI_HTTP_400');
    expect(safeSchedulerError(new Error('contains credentials'))).toBe('ODDS_REFRESH_FAILED');
  });
});
