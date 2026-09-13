import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {OddsBudgetStopped} from './budget';
vi.mock('./budget',async importOriginal=>({...await importOriginal<typeof import('./budget')>(),
  budgetHealth:async()=>({verified:true,routineRemaining:3800,period_end:new Date(Date.now()+19*86400000)})}));
const mocked=vi.hoisted(()=>({snapshot:vi.fn(),persist:vi.fn(),start:vi.fn(),account:vi.fn(),tournaments:vi.fn(),expanded:[] as Array<{id:string;slug:string;category:string;canonical:string}>}));
vi.mock('@/providers/oddspapi/M5OddsPapiAdapter',()=>({M5OddsPapiAdapter:class {
  snapshot=mocked.snapshot;accountPeriod=mocked.account;providerTournaments=mocked.tournaments;setCatalog=()=>undefined;
  requestCount(){return mocked.snapshot.mock.calls.length;}
}}));
vi.mock('@/providers/oddspapi/m5-normalizer',()=>({
  M5_TOURNAMENTS:[{id:'325',slug:'brasileiro-serie-a',category:'brazil',canonical:'brasileirao-serie-a'}],
  get M5_EXPANDED_TOURNAMENTS(){return mocked.expanded;},
  verifyCatalog:vi.fn(),
}));
vi.mock('./ingestion',()=>({startOddsJob:mocked.start,persistSnapshot:mocked.persist,canonicalFixtures:async()=>[
  {id:'test-only',competition:'brasileirao-serie-a',status:'SCHEDULED',kickoff:new Date(Date.now()+3600000).toISOString()},
  {id:'test-b',competition:'brasileirao-serie-b',status:'SCHEDULED',kickoff:new Date(Date.now()+7200000).toISOString()},
]}));
import {runOddsScheduler,safeSchedulerError} from './scheduler';
function database(){const query=vi.fn(async(sql:string)=>{
  if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:[]}],rowCount:1};
  if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].map(provider_slug=>({provider_slug,tournament_id:'325',public_eligible:true,useful_coverage:true,last_success_at:null})),rowCount:2};
  if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
  return {rows:[],rowCount:0};});const typed=query as unknown as QueryExecutor['query'];
  const db:DatabaseClient={query:typed,transaction:async w=>w({query:typed}),close:async()=>{}};return {db,query};
}
beforeEach(()=>{vi.clearAllMocks();mocked.expanded.length=0;mocked.start.mockResolvedValue('test-job');mocked.persist.mockResolvedValue({returnedFixtures:1,matchedFixtures:1,quotes:3,history_changes:0,current_writes:3,closed:0});mocked.tournaments.mockResolvedValue([]);});
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
  it('keeps the OddsPapi status when retry-target persistence fails',async()=>{
    mocked.snapshot.mockRejectedValue(new Error(JSON.stringify({status:400,message:'private'})));
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:[]}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].map(provider_slug=>({
        provider_slug,tournament_id:'325',public_eligible:true,useful_coverage:true,last_success_at:null}))};
      if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
      if(sql.includes('unnest($2::text[])'))throw new Error('odds_refresh_targets_tournament_id_check');
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async(w:(tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('FAILED');
    expect(result.error).toBe('ODDSPAPI_HTTP_400');
    expect(result.feeds).toEqual([]);
  });
  it('refreshes only the pinned known-good tournaments even if catalog has extras',async()=>{
    mocked.snapshot.mockResolvedValue({observedAt:new Date().toISOString()});
    const catalog=[
      {tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'},
      {tournamentId:326,tournamentSlug:'brasileiro-serie-b',categorySlug:'brazil'},
      {tournamentId:27464,tournamentSlug:'liga-mx-apertura',categorySlug:'mexico'},
      {tournamentId:17,tournamentSlug:'premier-league',categorySlug:'england'},
      {tournamentId:384,tournamentSlug:'copa-libertadores',categorySlug:'international-clubs'},
    ];
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:catalog}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].flatMap(provider_slug=>['325','326'].map(tournament_id=>({
        provider_slug,tournament_id,public_eligible:true,useful_coverage:true,last_success_at:null})))};
      if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async(w: (tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('SUCCEEDED');
    expect(mocked.snapshot.mock.calls.map(call=>call[1].sort())).toEqual([['325'],['325']]);
    expect(mocked.tournaments).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql])=>sql.includes("entity_type='COMPETITION'"))).toBe(true);
  });
  it('keeps the stable feed refreshing when a candidate tournament returns HTTP 400',async()=>{
    mocked.expanded.push({id:'326',slug:'brasileiro-serie-b',category:'brazil',canonical:'brasileirao-serie-b'});
    mocked.snapshot.mockImplementation(async(_bookmaker:string,ids:string[])=>{
      if(ids.includes('326'))throw new Error(JSON.stringify({status:400,message:'private'}));
      return {observedAt:new Date().toISOString()};
    });
    const catalog=[
      {tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'},
      {tournamentId:326,tournamentSlug:'brasileiro-serie-b',categorySlug:'brazil'},
    ];
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:catalog}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].flatMap(provider_slug=>['325','326'].map(tournament_id=>({
        provider_slug,tournament_id,public_eligible:true,useful_coverage:true,last_success_at:null,last_error:null})))};
      if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async(w: (tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('PARTIAL');
    expect(result.error).toBe('ODDSPAPI_HTTP_400');
    expect(mocked.snapshot.mock.calls.map(call=>call[1])).toEqual([['325'],['325'],['326'],['326']]);
    expect(mocked.persist).toHaveBeenCalledTimes(2);
    expect(mocked.snapshot.mock.calls.every(call=>!(call[1] as string[]).includes('325')||!(call[1] as string[]).includes('326'))).toBe(true);
    expect(query.mock.calls.some(call=>{
      const sql=String(call[0]);
      const params=(call as unknown as [string, unknown[]])[1];
      return sql.includes('unnest($2::text[])')&&Array.isArray(params?.[1])&&(params[1] as string[]).includes('326')&&!(params[1] as string[]).includes('325');
    })).toBe(true);
  });
});
