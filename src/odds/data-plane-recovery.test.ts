import {describe,it,expect,vi} from 'vitest';
import {refreshOutcomes} from './refresh-outcome';
import {snapshotDiagnostics} from './native-diagnostics';
import {dataPlaneTargets} from './reliability/data-plane';
import {claimRefreshTargets,reconcileRefreshQueue,releaseRefreshTargets} from './refresh-queue';
import {planScheduler,planTarget,type RefreshTarget} from './scheduler-policy';
import {reserveOddsRequest} from './budget';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {OddsSnapshot,CanonicalOddsFixture,ProviderOddsFixture} from './types';
const now=new Date('2026-10-01T10:00:00Z');
const raw:ProviderOddsFixture={providerId:'p',sport:'FOOTBALL',competition:'brasileirao-serie-a',providerCompetitionId:'325',kickoff:'2026-10-02T10:00:00Z',status:'PREGAME',homeProviderId:'h',awayProviderId:'a',homeNames:['Home'],awayNames:['Away']};
const fixture:CanonicalOddsFixture={id:'f',competitionId:'c',competition:'brasileirao-serie-a',sport:'FOOTBALL',kickoff:raw.kickoff,status:'SCHEDULED',homeId:'h',awayId:'a',home:'Home',away:'Away'};
const match={raw,fixture,state:'EXACT' as const,reason:'Verified identity'};
const snapshot:OddsSnapshot={bookmaker:'betsson',observedAt:now.toISOString(),tournamentIds:['325'],fixtures:[raw],quotes:[{providerFixtureId:'p',bookmaker:'betsson',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:now.toISOString(),observedAt:now.toISOString(),sourceDomain:'betsson.bet.br'}],rejected:{}};
const target:RefreshTarget={bookmaker:'betsson',tournamentId:'325',fixtures:[fixture],publicEligible:true,hasUsefulCoverage:false,lastSuccessAt:null,retryAfter:null};
describe('verified data-plane outcome, not HTTP success',()=>{
 it('does not assert supplier persistence for prices outside the seven-day write horizon',()=>{
   const kickoff=new Date(Date.now()+20*86400000).toISOString();
   const s={...snapshot,observedAt:new Date().toISOString()};
   const rows=snapshotDiagnostics(s,[{...match,raw:{...raw,kickoff},fixture:{...fixture,kickoff}}]);
   expect(rows.find(r=>r.market==='MATCH_WINNER'&&r.outcome==='HOME')?.classification).toBe('OUT_OF_SCOPE');
 });
 it('does not credit empty members of a batch with another tournament’s prices',()=>{
   const result=refreshOutcomes({...snapshot,tournamentIds:['325','17']},[match],new Set(['325','17']));
   expect(result.map(r=>r.outcome)).toEqual(['NATIVE_PERSISTED','PROVIDER_EMPTY']);expect(result[1].meaningful).toBe(false);
 });
 it('classifies a genuinely idle target as valid empty without native persistence',()=>{
   expect(refreshOutcomes({...snapshot,fixtures:[],quotes:[]},[],new Set())[0]).toMatchObject({outcome:'VALID_EMPTY',nativeSelections:0,meaningful:true});
 });
 it('distinguishes mapping failure from provider absence',()=>{
   expect(refreshOutcomes(snapshot,[{...match,fixture:null,state:'TEAM_MISMATCH'}],new Set(['325']))[0].outcome).toBe('MAPPING_EMPTY');
 });
 it('distinguishes parser rejection from empty provider data',()=>{
   const s={...snapshot,quotes:[],diagnostics:[{providerFixtureId:'p',tournamentId:'325',market:'MATCH_WINNER',outcome:'HOME',reason:'INVALID_DECIMAL_ODDS',evidence:{}}]};
   expect(refreshOutcomes(s,[match],new Set(['325']))[0].outcome).toBe('PARSER_EMPTY');
 });
 it.each(['SUSPENDED','WITHDRAWN','CLOSED'] as const)('persists %s as an explicit empty state, never native success',status=>{
   expect(refreshOutcomes({...snapshot,quotes:snapshot.quotes.map(q=>({...q,status}))},[match],new Set(['325']))[0]).toMatchObject({outcome:'VALID_EMPTY',nativeSelections:0});
 });
 it('does not use stale prices or far-future events as meaningful current native coverage',()=>{
   expect(refreshOutcomes({...snapshot,quotes:snapshot.quotes.map(q=>({...q,status:'STALE'}))},[match],new Set(['325']))[0].meaningful).toBe(false);
   expect(refreshOutcomes(snapshot,[{...match,raw:{...raw,kickoff:'2026-11-01T00:00:00Z'}}],new Set(['325']))[0].outcome).toBe('PROVIDER_EMPTY');
 });
});
describe('durable queue, fairness and unchanged quota protections',()=>{
 it('claims every target atomically or fails closed',async()=>{
   const query=vi.fn(async(sql:string)=>({rows:[],rowCount:sql.includes('UPDATE')?1:0}));const typed=query as unknown as QueryExecutor['query'];const db:DatabaseClient={query:typed,transaction:async fn=>fn({query:typed}),close:async()=>{}};
   await expect(claimRefreshTargets(db,'job','betsson',['325','17'])).rejects.toThrow('LEASE_UNAVAILABLE');
   expect(query.mock.calls[0][0]).toContain("queue_state='PENDING'");
 });
 it('reclaims only expired leases and preserves the original waiting time',async()=>{
   const query=vi.fn(async()=>({rows:[],rowCount:0}));await reconcileRefreshQueue({query:query as unknown as QueryExecutor['query']},planScheduler([target],now));
   const sql=String((query.mock.calls as unknown as string[][])[0][0]);expect(sql).toContain('lease_until<=$2');expect(sql).toContain('COALESCE(odds_refresh_targets.pending_since');expect(sql).toContain('stale_after');
   await releaseRefreshTargets({query:query as unknown as QueryExecutor['query']},'our-job');expect(String((query.mock.calls as unknown as string[][])[1][0])).toContain('WHERE lease_job_id=$1');
 });
 it('serves a deferred target before a repeatedly rescued competing bookmaker',()=>{
   const old={...target,bookmaker:'1xbet',tournamentId:'54',pendingSince:new Date(+now-30*60000).toISOString()};
   const rescue={...target,nativeExpiryAt:new Date(+now+60000).toISOString(),lastSuccessAt:new Date(+now-120*60000).toISOString()};
   expect(planScheduler([rescue,old],now).batches[0].bookmaker).toBe('1xbet');
 });
 it('uses verified checks for empty/mapping cadence without pretending native success',()=>{
   expect(planTarget({...target,lastCheckedAt:now.toISOString()},4,now)).toMatchObject({due:false,lastSuccessAt:null});
 });
 it('blocks paid retries for a permanent identity/schema failure, without suppressing other targets',()=>{
   const blocked={...target,mappingBlocked:true};
   expect(planTarget(blocked,4,now)).toMatchObject({due:false,delayReason:'MAPPING_REVIEW_REQUIRED'});
   const plan=planScheduler([blocked,{...target,bookmaker:'1xbet'}],now);
   expect(plan.batches.some(b=>b.bookmaker==='betsson')).toBe(false);
   expect(plan.batches.some(b=>b.bookmaker==='1xbet')).toBe(true);
 });
 it('does not starve unproven targets before the per-bookmaker probe limit is applied',()=>{
   const waiting={...target,tournamentId:'900',pendingSince:new Date(+now-30*60000).toISOString()};
   const newer=[901,902,903].map(id=>({...target,tournamentId:String(id),nativePriority:1000}));
   expect(planScheduler([...newer,waiting],now).batches.some(b=>b.tournamentIds.includes('900'))).toBe(true);
 });
 it('releases stable targets at the effective transient backoff boundary',()=>{
   const transient={...target,lastAttemptAt:new Date(+now-30*60000).toISOString(),retryAfter:new Date(+now+3600000).toISOString(),failureClass:'TRANSIENT_PROVIDER',backoffReason:'HTTP_5XX_TRANSIENT',recentNative:true,fixtures:[{...fixture,kickoff:new Date(+now+3600000).toISOString()}]};
   expect(planTarget(transient,4,now).due).toBe(true);expect(planScheduler([transient],now).batches.length).toBe(1);
 });
 it('stops at the shared hourly cap before reserving or calling a provider',async()=>{
   const query=vi.fn(async(sql:string)=>({rows:sql.includes('AS used')?[{used:72}]:[],rowCount:0}));
   await expect(reserveOddsRequest({query:query as unknown as QueryExecutor['query']},{id:'r',jobId:'j',endpoint:'/v4/odds-by-tournaments',query:{bookmaker:'betsson',tournamentIds:'325'},routine:true,unmetered:false})).rejects.toMatchObject({code:'ODDS_HOURLY_BUDGET_EXHAUSTED'});
   expect(query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 });
});
describe('all four targets are explainable without hidden-insurance greenwashing',()=>{
 const comps=[{competition:fixture.competition,tournamentId:'325',nearestKickoff:raw.kickoff,fixtures7d:1}];
 it('never calls an out-of-window competition overdue',()=>{
   const rows=dataPlaneTargets([{...comps[0],fixtures7d:0}],[],[],now,false);expect(rows).toHaveLength(4);expect(rows.every(r=>r.state==='OUTSIDE_REFRESH_WINDOW'&&r.staleAfter===null)).toBe(true);
 });
 it('reports per-bookmaker overdue independently of hidden coverage',()=>{
   const records=[{bookmaker:'betsson',tournament_id:'325',due_at:new Date(+now-60*60000),stale_after:new Date(+now-55*60000)}];
   const rows=dataPlaneTargets(comps,records,[{competition:fixture.competition,bookmaker:'betano.bet.br',kind:'REAL'}],now,false);
   expect(rows.find(r=>r.bookmaker==='betsson')).toMatchObject({state:'REFRESH_OVERDUE',overdueMinutes:55,responsibility:'LIVASPORTS'});
   expect(dataPlaneTargets(comps,records,[],now,true).find(r=>r.bookmaker==='betsson')?.state).toBe('BUDGET_DEFERRED');
 });
 it.each([['MAPPING_EMPTY','MAPPING_DEGRADED'],['PARSER_EMPTY','MAPPING_DEGRADED'],['PROVIDER_EMPTY','PROVIDER_EMPTY'],['VALID_EMPTY','PROVIDER_EMPTY']])('reports %s without inventing native prices', (outcome,state)=>{
   const row=dataPlaneTargets(comps,[{bookmaker:'betsson',tournament_id:'325',last_checked_at:now,last_outcome:outcome}],[],now,false)[0];expect(row.state).toBe(state);expect(row.nativeSelections).toBe(0);
 });
});
