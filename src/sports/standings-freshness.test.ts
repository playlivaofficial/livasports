import {describe,it,expect,vi} from 'vitest';
import {standingsEvidence,rejectStandingsSnapshot} from './standings-snapshot';
import {fetchStandings,standingsBackoff,STANDINGS_POLICY,runStandingsRefresh,standingsAwaitingSettlement,latestStandingsResult} from './standings-refresh';
import {standingsRevision,readStandingsFreshness} from './standings-read';
import {RecordingCacheInvalidator} from '@/cache/invalidation';
const row=(played=5,revision='2026-10-01 10:00:00')=>({id:1,participant_id:2,position:1,points:15,details:[{type_id:129,value:played}],season:{standings_recalculated_at:revision}});
const evidence=()=>standingsEvidence([row()],'2026-10-01T11:00:00Z');
const prior=()=>({fetched_at:'2026-10-01T10:01:00Z',provider_updated_at:'2026-10-01T10:00:00Z',snapshot_hash:'old',snapshot_metrics:{'0:0:2':5},row_count:1});
describe('standings snapshot truth',()=>{
 it('parses the source recalculation timestamp as UTC',()=>expect(evidence().providerUpdatedAt).toBe('2026-10-01T10:00:00.000Z'));
 it('hashes independent of transport order',()=>{const a=row(),b={...row(),id:2,participant_id:3};expect(standingsEvidence([a,b]).hash).toBe(standingsEvidence([b,a]).hash);});
 it('rejects older fetches',()=>expect(rejectStandingsSnapshot(prior(),{...evidence(),fetchedAt:'2026-10-01T09:00:00Z'})).toBe('OLDER_FETCH'));
 it('rejects older source revisions',()=>expect(rejectStandingsSnapshot(prior(),{...evidence(),providerUpdatedAt:'2026-09-30T10:00:00Z'})).toBe('OLDER_PROVIDER_SNAPSHOT'));
 it('rejects an unversioned overwrite of a versioned snapshot',()=>expect(rejectStandingsSnapshot(prior(),{...evidence(),providerUpdatedAt:null})).toBe('OLDER_PROVIDER_SNAPSHOT'));
 it('never erases a good table on empty response',()=>expect(rejectStandingsSnapshot(prior(),standingsEvidence([],'2026-10-01T11:00:00Z'))).toBe('EMPTY_REPLACEMENT'));
 it('rejects regressing played counts absent a newer source revision',()=>expect(rejectStandingsSnapshot(prior(),{...evidence(),metrics:{'0:0:2':4}})).toBe('REGRESSING_UNVERSIONED_SNAPSHOT'));
 it('allows positively newer corrections, including rescinded matches',()=>expect(rejectStandingsSnapshot(prior(),{...evidence(),providerUpdatedAt:'2026-10-01T10:30:00Z',metrics:{'0:0:2':4}})).toBeNull());
 it('keeps duplicated updates idempotent',()=>expect(rejectStandingsSnapshot({...prior(),snapshot_hash:evidence().hash},evidence())).toBeNull());
 it('rejects duplicate row identities',()=>expect(()=>standingsEvidence([row(),row()])).toThrow('DUPLICATE_STANDING'));
 it('rejects missing played metrics instead of inventing zero',()=>expect(()=>standingsEvidence([{...row(),details:[]}])).toThrow('INVALID_PLAYED'));
});
describe('bounded upstream refresh',()=>{
 it('keeps a changed but not-yet-settled source revision pending',()=>expect(standingsAwaitingSettlement(true,'different',evidence(),'2026-10-01T10:30:00Z')).toBe(true));
 it('accepts an authoritative revision after the latest completed result',()=>expect(standingsAwaitingSettlement(true,'different',evidence(),'2026-10-01T09:30:00Z')).toBe(false));
 it('keeps an unchanged dirty snapshot pending without source revision evidence',()=>expect(standingsAwaitingSettlement(true,evidence().hash,{...evidence(),providerUpdatedAt:null},null)).toBe(true));
 it('accepts unchanged source-versioned group tables after their last relevant result',()=>expect(standingsAwaitingSettlement(true,evidence().hash,evidence(),'2026-10-01T09:30:00Z')).toBe(false));
 it('does not loop on empty non-table competitions',()=>expect(standingsAwaitingSettlement(true,'same',{...evidence(),hash:'same',rows:0,metrics:{},providerUpdatedAt:null},null)).toBe(false));
 it('does not invent a pending result when the table has no completed fixture in its scope',()=>expect(standingsAwaitingSettlement(true,evidence().hash,evidence(),null)).toBe(false));
 it('compares only returned standings stages/groups without extra provider calls',async()=>{const db={query:vi.fn(async()=>({rows:[{last_result_at:null}]}))};await latestStandingsResult(db as never,'season',{...evidence(),metrics:{'100:20:2':5,'100:20:3':5,'100:21:4':5}});const [sql,args]=db.query.mock.calls[0] as unknown as [string,string[]];expect(sql).toContain("f.status='FINISHED'");expect(sql).toContain('scope.stage=f.provider_stage_id');expect(sql).toContain('f.provider_group_id');expect(JSON.parse(args[1])).toEqual([{stage:100,group:20},{stage:100,group:21}]);expect(db.query).toHaveBeenCalledTimes(1);});
 it.each([401,403,404,429,500,503])('makes one attempt on HTTP %s with no blind retry',async status=>{const transport=vi.fn(async()=>new Response('{}',{status}));await expect(fetchStandings('private-test-value','123',transport as never)).rejects.toThrow(`HTTP_${status}`);expect(transport).toHaveBeenCalledTimes(1);});
 it('requests complete season standings and source revision without auth in the URL',async()=>{const transport=vi.fn(async()=>Response.json({data:[row()]}));await fetchStandings('private-test-value','123',transport as never);const [url,options]=transport.mock.calls[0] as unknown as [URL,RequestInit];expect(url.pathname).toBe('/v3/football/standings/seasons/123');expect(url.searchParams.get('include')).toContain('season');expect(url.href).not.toContain('private-test-value');expect(options.cache).toBe('no-store');});
 it('rejects truncated data',async()=>{await expect(fetchStandings('test','123',(async()=>Response.json({data:[row()],pagination:{has_more:true}})) as never)).rejects.toThrow('INCOMPLETE_RESPONSE');});
 it('backs off pending/failing providers and bounds every tick',()=>{expect([1,2,3,4,5,6].map(n=>standingsBackoff(n,'PROVIDER_PENDING'))).toEqual([5,15,60,360,720,720]);expect(standingsBackoff(1,'HTTP_403')).toBe(1440);expect(STANDINGS_POLICY).toMatchObject({perTick:3,dailyCap:192,hourlyCap:48,safetyHours:12});});
 it('does not request anything without configuration',async()=>{const transport=vi.fn();expect((await runStandingsRefresh({} as never,undefined,new RecordingCacheInvalidator(),transport)).status).toBe('NOT_CONFIGURED');expect(transport).not.toHaveBeenCalled();});
});
describe('standings read freshness',()=>{
 it('changes cache key on newly committed revision across warm processes',async()=>{let version=1;const db={query:vi.fn(async()=>({rows:[{snapshot_version:version}]}))};const a=await standingsRevision(db as never,'league');version=2;expect(await standingsRevision(db as never,'league')).not.toBe(a);});
 it('reports pending/failure honestly despite recent fetch',async()=>{const db={query:vi.fn(async()=>({rows:[{competition_id:'c',season_id:'s',dirty_version:'2',refreshed_version:'1',age_seconds:10,last_error:'PROVIDER_PENDING',snapshot_version:1}]}))};expect(await readStandingsFreshness(db as never,'s')).toMatchObject({stale:true,pending:true,lastError:'PROVIDER_PENDING',ageSeconds:10});});
});
