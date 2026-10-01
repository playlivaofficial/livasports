import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {ReliabilityHealth} from './read';
import {alertDecision,alertMessage,retryAlertDelivery} from './alerts';

const mocked=vi.hoisted(()=>({health:null as unknown as ReliabilityHealth,emailConfigured:false}));
vi.mock('./read',()=>({readReliabilityHealth:vi.fn(async()=>mocked.health),alertEmailConfigured:()=>mocked.emailConfigured}));
import {evaluateReliability,RESOLVE_GRACE_MINUTES,acknowledgeIncident,logRecoveryAction} from './incidents';

const now=new Date('2026-09-18T12:00:00Z');
const competition=(over:Partial<ReliabilityHealth['competitions'][number]>={}):ReliabilityHealth['competitions'][number]=>({competition:'bundesliga',tournamentId:'35',health:'HEALTHY',tier:1,nearestKickoff:now.toISOString(),issues:[],notes:[],primary:null,
  targetState:'ACTIVE',providerState:'OK',lastSuccessAt:now.toISOString(),lastRefreshAgeMinutes:5,nextRefreshDueAt:null,quoteAges:{p50Minutes:1,p95Minutes:2,oldestMinutes:3,currentQuotes:1,staleQuotes:0,expiredQuotes:0},catalogState:'MAPPED',
  windows:Object.fromEntries(['24h','3d','7d','14d'].map(k=>[k,{fixtures:1,anyOdds:1,matchWinner:1,totalGoals25:1,btts:1,betanoReal:1,betssonReal:1,bothReal:1,proxyOnly:0,neither:0,staleOnly:0,closedOnly:0,anyOddsPct:100,matchWinnerPct:100,totalGoals25Pct:100,bttsPct:100,betanoRealPct:100,betssonRealPct:100,proxyPct:0,neitherPct:0,stalePct:0}])) as never,
  feeds:[],baseline:null,...over});
const health=(competitions:ReliabilityHealth['competitions'],global:ReliabilityHealth['global']=[]):ReliabilityHealth=>({version:'p3.1',generatedAt:now.toISOString(),overall:'HEALTHY',counts:{HEALTHY:0,DEGRADED:0,CRITICAL:0,UPSTREAM_UNAVAILABLE:0,UNMAPPED:0,UNKNOWN:0,IDLE:0},
  horizons:{} as never,bookmakers:{betanoRealPct:0,betssonRealPct:0,bothRealPct:0,proxyPct:0,neitherPct:0,stalePct:0,window:'7d'},quoteAges:{p50Minutes:null,p95Minutes:null,oldestMinutes:null,currentQuotes:0,staleQuotes:0,expiredQuotes:0},
  competitions,global,scheduler:{state:'SUCCEEDED',lastAutomaticInvocationAt:null,lastSuccessfulRefreshAt:null,nextDueAt:null,automationEnabled:true,lastError:null,lastJob:null},budget:null,budgetVerified:true,
  catalog:{mapped:0,unmatched:0,ambiguous:0,ignored:0,disabled:0,rows:[]},incidents:[],recovery:[],alerting:{email:'NOT_CONFIGURED',dashboard:'ALWAYS'},liveOdds:{} as never});
function database(openIncidents:Array<Record<string,unknown>>){
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes('FROM odds_incidents WHERE state<>'))return {rows:openIncidents,rowCount:openIncidents.length};
    if(sql.includes('INSERT INTO odds_incidents'))return {rows:[{id:'11111111-1111-4111-8111-111111111111',opened_at:now}],rowCount:1};
    if(sql.includes("alert_channel='EMAIL_PENDING'"))return {rows:[{id:'claimed'}],rowCount:1};
    return {rows:[],rowCount:0};
  });
  const typed=query as unknown as QueryExecutor['query'];
  return {db:{query:typed,transaction:async(w:(tx:{query:QueryExecutor['query']})=>unknown)=>w({query:typed}),close:async()=>{}} as DatabaseClient,query};
}
describe('P3 incidents, deduplication and alerting (§19–§21)',()=>{
  beforeEach(()=>{mocked.emailConfigured=false;});
  it('retries undelivered alerts after configuration/recovery, without per-tick email storms',()=>{
    expect(retryAlertDelivery({alert_channel:'DASHBOARD',alert_sent_at:now},now,true)).toBe(true);
    expect(retryAlertDelivery({alert_channel:'EMAIL_FAILED',alert_sent_at:now},now,true)).toBe(false);
    expect(retryAlertDelivery({alert_channel:'EMAIL_FAILED',alert_sent_at:new Date(now.getTime()-31*60_000)},now,true)).toBe(true);
    expect(retryAlertDelivery({alert_channel:'EMAIL'},now,true)).toBe(false);
    expect(retryAlertDelivery({alert_channel:'DASHBOARD'},now,false)).toBe(false);
  });
  it('opens one CRITICAL incident per competition+classification, writes a rollup, and e-mails the owner once when configured',async()=>{
    mocked.health=health([competition({health:'CRITICAL',primary:'REFRESH_NOT_EXECUTED',issues:[{classification:'REFRESH_NOT_EXECUTED',severity:'CRITICAL',evidence:'expired',affectedFixtures:1}]})]);
    const transport=vi.fn(async()=>undefined);const {db,query}=database([]);
    const result=await evaluateReliability(db,{now,transport,alertTo:'owner@example.test'});
    expect(result.opened).toBe(1);expect(result.alerts).toEqual([{kind:'OPENED',competition:'bundesliga',classification:'REFRESH_NOT_EXECUTED',channel:'EMAIL'}]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql])=>String(sql).includes('INSERT INTO odds_health_rollups'))).toBe(true);
    const insert=query.mock.calls.find(([sql])=>String(sql).includes('INSERT INTO odds_incidents'));
    expect(String(insert![0])).toContain('ON CONFLICT DO NOTHING');
  });
  it('an already-open incident is updated, never re-alerted; escalation WARNING→CRITICAL alerts once; no email → dashboard channel',async()=>{
    mocked.health=health([competition({issues:[{classification:'BOOKMAKER_COLLAPSE',severity:'CRITICAL',evidence:'both',affectedFixtures:9}]})]);
    const transport=vi.fn(async()=>undefined);
    const {db:same}=database([{id:'a',competition:'bundesliga',classification:'BOOKMAKER_COLLAPSE',severity:'CRITICAL',state:'OPEN',alert_severity:'CRITICAL',last_seen_at:now}]);
    const unchanged=await evaluateReliability(same,{now,transport,alertTo:'owner@example.test'});
    expect(unchanged.opened).toBe(0);expect(unchanged.updated).toBe(1);expect(unchanged.alerts).toEqual([]);expect(transport).not.toHaveBeenCalled();
    const {db:warned}=database([{id:'b',competition:'bundesliga',classification:'BOOKMAKER_COLLAPSE',severity:'WARNING',state:'OPEN',alert_severity:null,last_seen_at:now}]);
    const escalated=await evaluateReliability(warned,{now,transport,alertTo:null});
    expect(escalated.alerts).toEqual([{kind:'OPENED',competition:'bundesliga',classification:'BOOKMAKER_COLLAPSE',channel:'DASHBOARD'}]);expect(transport).not.toHaveBeenCalled();
  });
  it('recovery success closes the incident after the grace window and sends one RESOLVED follow-up when an alert was sent',async()=>{
    mocked.health=health([competition()]);
    const transport=vi.fn(async()=>undefined);
    const stale=new Date(now.getTime()-(RESOLVE_GRACE_MINUTES+1)*60000);
    const {db,query}=database([{id:'c',competition:'bundesliga',classification:'REFRESH_NOT_EXECUTED',severity:'CRITICAL',state:'OPEN',alert_severity:'CRITICAL',last_seen_at:stale}]);
    const result=await evaluateReliability(db,{now,transport,alertTo:'owner@example.test'});
    expect(result.resolved).toBe(1);expect(result.alerts).toEqual([{kind:'RESOLVED',competition:'bundesliga',classification:'REFRESH_NOT_EXECUTED',channel:'EMAIL'}]);
    expect(query.mock.calls.some(([sql])=>String(sql).includes("SET state='RESOLVED'"))).toBe(true);
    // flap guard: a condition seen a minute ago is not resolved yet
    const {db:recent}=database([{id:'d',competition:'bundesliga',classification:'REFRESH_NOT_EXECUTED',severity:'CRITICAL',state:'OPEN',alert_severity:null,last_seen_at:new Date(now.getTime()-60000)}]);
    expect((await evaluateReliability(recent,{now,transport,alertTo:null})).resolved).toBe(0);
  });
  it('idle competitions resolve immediately as season-window closed; warnings never e-mail; global issues are keyed as platform',async()=>{
    mocked.health=health([competition({health:'IDLE'})],[{classification:'SCHEDULER_STALLED',severity:'CRITICAL',evidence:'no tick',affectedFixtures:0}]);
    const transport=vi.fn(async()=>undefined);
    const {db,query}=database([{id:'e',competition:'bundesliga',classification:'PROXY_DOMINANT',severity:'WARNING',state:'OPEN',alert_severity:null,last_seen_at:now}]);
    const result=await evaluateReliability(db,{now,transport,alertTo:'owner@example.test'});
    expect(result.resolved).toBe(1);expect(result.opened).toBe(1);
    expect(result.alerts).toEqual([{kind:'OPENED',competition:'*',classification:'SCHEDULER_STALLED',channel:'EMAIL'}]);
    const resolve=query.mock.calls.find(([sql])=>String(sql).includes("SET state='RESOLVED'"));
    expect(((resolve as unknown as [string,unknown[]])[1])[2]).toContain('seven-day odds refresh window');
  });
  it('alert decisions and copy: one open alert per incident, follow-ups only on escalation or resolution; message has no secrets',()=>{
    expect(alertDecision(null,{severity:'WARNING',state:'OPEN'})).toBeNull();
    expect(alertDecision(null,{severity:'CRITICAL',state:'OPEN'})).toBe('OPENED');
    expect(alertDecision({severity:'CRITICAL',alertSeverity:'CRITICAL',state:'OPEN'},{severity:'CRITICAL',state:'OPEN'})).toBeNull();
    expect(alertDecision({severity:'WARNING',alertSeverity:'WARNING',state:'OPEN'},{severity:'CRITICAL',state:'OPEN'})).toBe('ESCALATED');
    expect(alertDecision({severity:'WARNING',alertSeverity:null,state:'OPEN'},{severity:'WARNING',state:'RESOLVED'})).toBeNull();
    const m=alertMessage('OPENED',{competition:'bundesliga',classification:'REFRESH_NOT_EXECUTED',severity:'CRITICAL',affectedFixtures:1,detail:{evidence:'expired'},openedAt:now.toISOString()},'https://livasports.com/owner/health');
    expect(m.subject).toBe('[LivaSports odds] CRITICAL: REFRESH_NOT_EXECUTED — bundesliga');expect(m.text).toContain('Dashboard: https://livasports.com/owner/health');expect(m.text).not.toMatch(/apiKey|secret|token/i);
  });
  it('acknowledge only transitions OPEN incidents; recovery log failures never throw',async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes('ACKNOWLEDGED')?{rows:[{id:'x'}],rowCount:1}:(()=>{throw new Error('down');})());
    expect(await acknowledgeIncident({query:query as unknown as QueryExecutor['query']},'x')).toBe(true);
    await expect(logRecoveryAction({query:query as unknown as QueryExecutor['query']},{trigger:'SCHEDULER',action:'URGENT_REFRESH',reason:'r',outcome:'SUCCEEDED'})).resolves.toBeUndefined();
  });
});
