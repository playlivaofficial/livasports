import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
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
  M5_REJECTED_TOURNAMENTS:[],
  verifyCatalog:vi.fn(),
}));
vi.mock('./ingestion',()=>({startOddsJob:mocked.start,persistSnapshot:mocked.persist,canonicalFixtures:async()=>[
  {id:'test-only',competition:'brasileirao-serie-a',status:'SCHEDULED',kickoff:new Date(Date.now()+3600000).toISOString()},
  {id:'test-b',competition:'brasileirao-serie-b',status:'SCHEDULED',kickoff:new Date(Date.now()+7200000).toISOString()},
]}));
import {integrityCheck,runOddsScheduler,safeSchedulerError,schedulerPlan} from './scheduler';
function database(){const query=vi.fn(async(sql:string)=>{
  if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:[]}],rowCount:1};
  if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].map(provider_slug=>({provider_slug,tournament_id:'325',public_eligible:true,useful_coverage:true,last_success_at:null})),rowCount:2};
  if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
  return {rows:[],rowCount:0};});const typed=query as unknown as QueryExecutor['query'];
  const db:DatabaseClient={query:typed,transaction:async w=>w({query:typed}),close:async()=>{}};return {db,query};
}
beforeEach(()=>{vi.clearAllMocks();mocked.expanded.length=0;mocked.start.mockResolvedValue('test-job');mocked.persist.mockResolvedValue({returnedFixtures:1,matchedFixtures:1,quotes:3,history_changes:0,current_writes:3,closed:0});mocked.tournaments.mockResolvedValue([]);});
describe('scheduler independent failure and durable completion',()=>{
  it('stops fan-out on HTTP 500 without persisting an empty snapshot or closing stored quotes',async()=>{
    mocked.snapshot.mockRejectedValue(new Error(JSON.stringify({status:500})));
    const {db}=database();const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('FAILED');expect(result.error).toBe('ODDSPAPI_HTTP_500');
    expect(mocked.snapshot).toHaveBeenCalledTimes(1);expect(mocked.persist).not.toHaveBeenCalled();
  });
  it('counts only currently usable pregame quotes as useful recovery coverage',async()=>{
    const {db,query}=database();await schedulerPlan(db);
    const sql=query.mock.calls.find(([sql])=>sql.includes('AS useful_coverage'))?.[0]??'';
    expect(sql).toContain("o.scope='FULL_TIME_REGULATION'");
    expect(sql).toContain('o.freshness_ttl_minutes>0');
    expect(sql).toContain("o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now()");
    expect(sql).toContain('abs(extract(epoch FROM (f.kickoff-o.provider_kickoff)))<=600');
    expect(sql).toContain("f.kickoff<=now()+interval '7 days'");
  });
  it('preserves the successful second feed when the first fails; records PARTIAL with a sanitized code',async()=>{
    mocked.snapshot.mockRejectedValueOnce(new Error('private upstream error')).mockResolvedValueOnce({observedAt:new Date().toISOString()});
    const {db,query}=database();const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('PARTIAL');expect(result.feeds).toHaveLength(1);expect(mocked.persist).toHaveBeenCalledTimes(1);
    expect(result.error).toBe('ODDS_REFRESH_FAILED');expect(query.mock.calls.some(([s])=>s.includes('ELSE now()+LEAST(360,power(2,LEAST(odds_refresh_targets.consecutive_failures,5))*15)'))).toBe(true);
  });
  it('ends as BUDGET_STOPPED, not an uncontrolled retry or a false success',async()=>{
    mocked.snapshot.mockRejectedValue(new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED'));
    const {db,query}=database();const result=await runOddsScheduler(db,'test-only');expect(result.state).toBe('BUDGET_STOPPED');
    expect(mocked.snapshot).toHaveBeenCalledTimes(1);expect(mocked.persist).not.toHaveBeenCalled();
    // P0 incident: a ledger stop never demotes a feed — no retry/failure row is written for the targets in the batch.
    expect(query.mock.calls.some(([sql])=>String(sql).includes('INSERT INTO odds_refresh_targets'))).toBe(false);
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
  it('refreshes the pinned stable batch and, in isolation, every catalog row that resolves to an enabled competition with upcoming fixtures',async()=>{
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
    // 326 (brasileiro-serie-b) is not on the historical allowlist but resolves from the catalog: it is probed as a singleton per bookmaker.
    expect(mocked.snapshot.mock.calls.map(call=>call[1].slice().sort())).toEqual([['325'],['325'],['326'],['326']]);
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
  it('treats an expanded singleton FIXTURE_NOT_FOUND as an empty feed, not a global scheduler failure',async()=>{
    mocked.expanded.push({id:'326',slug:'brasileiro-serie-b',category:'brazil',canonical:'brasileirao-serie-b'});
    mocked.snapshot.mockImplementation(async(_bookmaker:string,ids:string[])=>{
      if(ids.includes('326'))throw new Error(JSON.stringify({status:404,body:{error:{code:'FIXTURE_NOT_FOUND',message:'No fixtures found'}}}));
      return {observedAt:new Date().toISOString()};
    });
    const catalog=[
      {tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'},
      {tournamentId:326,tournamentSlug:'brasileiro-serie-b',categorySlug:'brazil'},
    ];
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:catalog}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].flatMap(provider_slug=>['325','326'].map(tournament_id=>({
        provider_slug,tournament_id,public_eligible:true,useful_coverage:true,
        last_success_at:tournament_id==='325'?new Date():null,last_error:null})))};
      if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async(w: (tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    const result=await runOddsScheduler(db,'test-only');
    expect(result.state).toBe('SUCCEEDED');
    expect(result.error).toBeNull();
    expect(mocked.persist).not.toHaveBeenCalled();
    expect(mocked.snapshot.mock.calls.every(call=>(call[1] as string[]).join()==='326')).toBe(true);
    expect(query.mock.calls.some(call=>{
      const sql=String(call[0]);
      const params=(call as unknown as [string, unknown[]])[1];
      return sql.includes('unnest($2::text[])')&&Array.isArray(params?.[1])&&(params[1] as string[]).includes('326')&&params[2]==='ODDSPAPI_HTTP_404'&&params[3]===true;
    })).toBe(true);
  });
  it('applies the short retry ladder, not the 12h backoff, when a previously priced feed reports FIXTURE_NOT_FOUND',async()=>{
    mocked.expanded.push({id:'326',slug:'brasileiro-serie-b',category:'brazil',canonical:'brasileirao-serie-b'});
    mocked.snapshot.mockImplementation(async(_bookmaker:string,ids:string[])=>{
      if(ids.includes('326'))throw new Error(JSON.stringify({status:404,body:{error:{code:'FIXTURE_NOT_FOUND',message:'No fixtures found'}}}));
      return {observedAt:new Date().toISOString()};
    });
    const catalog=[{tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil'},{tournamentId:326,tournamentSlug:'brasileiro-serie-b',categorySlug:'brazil'}];
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('odds_provider_catalog'))return {rows:[{markets:[],tournaments:catalog}],rowCount:1};
      if(sql.includes('FROM bookmakers b'))return {rows:['betano.bet.br','betsson'].flatMap(provider_slug=>['325','326'].map(tournament_id=>({
        provider_slug,tournament_id,public_eligible:true,useful_coverage:tournament_id==='325',last_success_at:new Date(Date.now()-3*3600000),consecutive_failures:0,last_error:null})))};
      if(sql.includes('reconciliation_at>'))return {rows:[{}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async(w: (tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient;
    await runOddsScheduler(db,'test-only');
    const retry=query.mock.calls.find(call=>String(call[0]).includes('unnest($2::text[])'));
    expect(retry).toBeTruthy();expect((retry as unknown as [string,unknown[]])[1][3]).toBe(false);
  });
  describe('P3 reliability integration',()=>{
    it('post-refresh integrity flags suspicious outcomes and stays silent on normal ones (§14)',()=>{
      const base={bookmaker:'betsson',tournamentIds:['35'],returnedFixtures:9,matchedFixtures:9,quotes:63,currentWrites:63,closed:0};
      expect(integrityCheck(base)).toBeNull();
      expect(integrityCheck({...base,matchedFixtures:0,quotes:0,currentWrites:0})).toMatchObject({classification:'MAPPING_FAILED',severity:'CRITICAL'});
      expect(integrityCheck({...base,quotes:0,currentWrites:0,rejected:[{},{}]})).toMatchObject({classification:'NORMALIZATION_REJECTED',severity:'CRITICAL'});
      expect(integrityCheck({...base,closed:40,currentWrites:3})).toMatchObject({classification:'PROVIDER_NOT_OFFERED',severity:'WARNING'});
      expect(integrityCheck({...base,returnedFixtures:0,matchedFixtures:0,quotes:0,currentWrites:0})).toBeNull();
    });
    it('an urgent batch is logged as a recovery action with its cost and the tick ends with a reliability evaluation (§22)',async()=>{
      mocked.snapshot.mockResolvedValue({observedAt:new Date().toISOString()});
      const {db,query}=database();const result=await runOddsScheduler(db,'test-only');
      expect(result.state).toBe('SUCCEEDED');
      const actions=(query.mock.calls as unknown as [string,unknown[]][]).filter(([sql])=>String(sql).includes('INSERT INTO odds_recovery_actions')).map(c=>c[1]);
      expect(actions.some(a=>a[1]==='URGENT_REFRESH'&&a[6]===1&&a[7]==='SUCCEEDED')).toBe(true);
      expect(result.reliability).toMatchObject({overall:expect.any(String),opened:0,resolved:0});
      expect(query.mock.calls.some(([sql])=>String(sql).includes('DELETE FROM odds_health_rollups'))).toBe(true);
    });
    it('a ledger stop is logged as a deferred recovery action with the next tick as retry, never as a target failure',async()=>{
      mocked.snapshot.mockRejectedValue(new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED'));
      const {db,query}=database();await runOddsScheduler(db,'test-only');
      const stop=(query.mock.calls as unknown as [string,unknown[]][]).map(c=>c[1]).find(a=>Array.isArray(a)&&a[1]==='BUDGET_STOP');
      expect(stop).toBeTruthy();expect(stop![7]).toBe('DEFERRED');expect(stop![8]).toBeTruthy();
      expect(query.mock.calls.some(([sql])=>String(sql).includes('INSERT INTO odds_refresh_targets'))).toBe(false);
    });
  });
});
