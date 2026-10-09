import {describe,it,expect} from 'vitest';
import {emptyCounts,type CoverageWindow,type CoverageWindowCounts} from '../coverage-health';
import {classifyCompetition,classifyGlobal,worstHealth,type FeedEvidence,type ReliabilityInput} from './classify';
import {classifyErrorCode,freshnessState,urgencyTier} from './model';

const now=new Date('2026-09-18T12:00:00Z');
const at=(hours:number)=>new Date(now.getTime()+hours*3600000).toISOString();
const windows=(over:Partial<Record<CoverageWindow,Partial<CoverageWindowCounts>>>={})=>Object.fromEntries((['24h','3d','7d','14d'] as const).map(k=>[k,{...emptyCounts(),...over[k]}])) as ReliabilityInput['windows'];
const feed=(bookmaker:string,over:Partial<FeedEvidence>={}):FeedEvidence=>({bookmaker,lastSuccessAt:at(-1),lastAttemptAt:at(-1),retryAfter:null,consecutiveFailures:0,lastError:null,
  snapshot:{observedAt:at(-1),returnedFixtures:10,quotes:70,nearTermFixtures:5,nearTermQuotes:35},request:{startedAt:at(-1),outcome:'SUCCEEDED',httpStatus:200},...over});
const input=(over:Partial<ReliabilityInput>={}):ReliabilityInput=>({competition:'bundesliga',tournamentId:'35',nearestKickoff:at(6),lastSuccessAt:at(-1),lastAttemptAt:at(-1),consecutiveFailures:0,lastError:null,
  windows:windows({'24h':{fixtures:1,anyOdds:1,matchWinner:1,betanoReal:1,betssonReal:1,bothReal:1},'3d':{fixtures:9,anyOdds:9,matchWinner:9,betanoReal:9,betssonReal:9,bothReal:9},'7d':{fixtures:9,anyOdds:9,matchWinner:9,betanoReal:9,betssonReal:9,bothReal:9},'14d':{fixtures:18,anyOdds:9,matchWinner:9,betanoReal:9,betssonReal:9,bothReal:9,neither:9}}),
  feeds:[feed('betano.bet.br'),feed('betsson')],baseline:null,catalogState:'MAPPED',quoteAges:{p50Minutes:20,p95Minutes:50,oldestMinutes:60,currentQuotes:63,staleQuotes:0,expiredQuotes:0},...over});

describe('P3 health classification (§28)',()=>{
  it('uses persisted paced deadlines without weakening expired-quote or mapping failure evidence',()=>{
    const paced=[feed('betsson',{lastSuccessAt:at(-10),dueAt:at(2),staleAfter:at(2.1)})];
    const healthy=classifyCompetition(input({lastSuccessAt:at(-10),feeds:paced}),now);
    expect(healthy.issues.some(i=>i.classification==='REFRESH_NOT_EXECUTED')).toBe(false);
    expect(healthy.nextRefreshDueAt).toBe(at(2));
    const late=classifyCompetition(input({lastSuccessAt:at(-10),feeds:[{...paced[0],staleAfter:at(-0.1)}]}),now);
    expect(late.issues.some(i=>i.classification==='REFRESH_NOT_EXECUTED')).toBe(true);
    const expired=classifyCompetition(input({lastSuccessAt:at(-10),feeds:paced,windows:windows({'24h':{fixtures:1,staleOnly:1,neither:1},'7d':{fixtures:1,staleOnly:1,neither:1}})}),now);
    expect(expired.health).toBe('CRITICAL');expect(expired.issues.some(i=>i.classification==='REFRESH_NOT_EXECUTED')).toBe(true);
    const unmapped=classifyCompetition(input({lastSuccessAt:at(-10),feeds:[{...paced[0],lastOutcome:'MAPPING_EMPTY'}],windows:windows({'24h':{fixtures:1,neither:1},'7d':{fixtures:1,neither:1}})}),now);
    expect(unmapped.issues.some(i=>i.classification==='MAPPING_FAILED')).toBe(true);
  });
  it('keeps a failed data plane degraded, but names a proven mapping failure instead of implying no execution',()=>{
    const h=classifyCompetition(input({lastSuccessAt:at(-10),nearestKickoff:at(40),windows:windows({'3d':{fixtures:3,neither:3},'7d':{fixtures:3,neither:3}}),
      feeds:[feed('1xbet',{lastOutcome:'MAPPING_EMPTY'})]}),now);
    expect(h.health).toBe('DEGRADED');expect(h.issues.some(i=>i.classification==='MAPPING_FAILED')).toBe(true);
    expect(h.issues.some(i=>i.classification==='REFRESH_NOT_EXECUTED')).toBe(false);
  });
  it('healthy competition with both bookmakers priced reports HEALTHY and no issues',()=>{
    const h=classifyCompetition(input(),now);
    expect(h.health).toBe('HEALTHY');expect(h.issues).toEqual([]);expect(h.tier).toBe(1);expect(h.targetState).toBe('ACTIVE');expect(h.providerState).toBe('OK');
  });
  it('A: fixture <=12h, provider had prices, local quotes expired → CRITICAL REFRESH_NOT_EXECUTED (internal gap)',()=>{
    const h=classifyCompetition(input({lastSuccessAt:at(-5),windows:windows({'24h':{fixtures:1,staleOnly:1,neither:1},'3d':{fixtures:9,anyOdds:8,betanoReal:8,betssonReal:8,bothReal:8,staleOnly:1,neither:1},'7d':{fixtures:9,anyOdds:8,betanoReal:8,betssonReal:8,bothReal:8,staleOnly:1,neither:1},'14d':{fixtures:9,anyOdds:8}}),
      feeds:[feed('betano.bet.br',{lastSuccessAt:at(-5),snapshot:{observedAt:at(-5),returnedFixtures:9,quotes:63,nearTermFixtures:9,nearTermQuotes:63}}),feed('betsson',{lastSuccessAt:at(-5),snapshot:{observedAt:at(-5),returnedFixtures:9,quotes:63,nearTermFixtures:9,nearTermQuotes:63}})]}),now);
    expect(h.health).toBe('CRITICAL');expect(h.primary).toBe('REFRESH_NOT_EXECUTED');expect(h.issues[0].severity).toBe('CRITICAL');
  });
  it('B: fixture <=12h, provider explicitly closed every market → UPSTREAM_UNAVAILABLE, not internal CRITICAL',()=>{
    const h=classifyCompetition(input({windows:windows({'24h':{fixtures:1,staleOnly:1,closedOnly:1,neither:1},'3d':{fixtures:1,staleOnly:1,closedOnly:1,neither:1},'7d':{fixtures:1,staleOnly:1,closedOnly:1,neither:1},'14d':{fixtures:1}}),
      feeds:[feed('betano.bet.br',{snapshot:{observedAt:at(-0.5),returnedFixtures:3,quotes:0,nearTermFixtures:0,nearTermQuotes:0}}),feed('betsson',{snapshot:{observedAt:at(-0.5),returnedFixtures:3,quotes:0,nearTermFixtures:0,nearTermQuotes:0}})]}),now);
    expect(h.health).toBe('UPSTREAM_UNAVAILABLE');expect(h.primary).toBe('PROVIDER_NOT_OFFERED');expect(h.issues.every(i=>i.severity==='WARNING')).toBe(true);
  });
  it('B2: FIXTURE_NOT_FOUND on every feed with no stored rows → UPSTREAM_UNAVAILABLE',()=>{
    const h=classifyCompetition(input({lastSuccessAt:null,windows:windows({'24h':{fixtures:2,neither:2},'3d':{fixtures:2,neither:2},'7d':{fixtures:2,neither:2},'14d':{fixtures:2,neither:2}}),
      feeds:[feed('betano.bet.br',{lastSuccessAt:null,consecutiveFailures:2,lastError:'ODDSPAPI_HTTP_404',snapshot:null}),feed('betsson',{lastSuccessAt:null,consecutiveFailures:2,lastError:'ODDSPAPI_HTTP_404',snapshot:null})]}),now);
    expect(h.health).toBe('UPSTREAM_UNAVAILABLE');expect(h.providerState).toBe('NOT_OFFERED');
  });
  it('C: competition has fixtures inside 7 days but no scheduler target → CRITICAL TARGET_MISSING; ambiguous catalog → UNMAPPED MAPPING_FAILED',()=>{
    const missing=classifyCompetition(input({competition:'la-liga-2',tournamentId:null,feeds:[],catalogState:'NONE',windows:windows({'24h':{fixtures:1,neither:1},'3d':{fixtures:11,neither:11},'7d':{fixtures:11,neither:11},'14d':{fixtures:22,neither:22}})}),now);
    expect(missing.health).toBe('CRITICAL');expect(missing.primary).toBe('TARGET_MISSING');expect(missing.targetState).toBe('MISSING');
    const ambiguous=classifyCompetition(input({competition:'conference-league',tournamentId:null,feeds:[],catalogState:'AMBIGUOUS',nearestKickoff:at(30*24),windows:windows({'14d':{fixtures:0}})}),now);
    expect(ambiguous.health).toBe('IDLE');
    const ambiguousSoon=classifyCompetition(input({competition:'conference-league',tournamentId:null,feeds:[],catalogState:'AMBIGUOUS',windows:windows({'3d':{fixtures:4,neither:4},'7d':{fixtures:4,neither:4},'14d':{fixtures:4,neither:4}})}),now);
    expect(ambiguousSoon.health).toBe('UNMAPPED');expect(ambiguousSoon.primary).toBe('MAPPING_FAILED');
    const unmatchedFar=classifyCompetition(input({competition:'x',tournamentId:null,feeds:[],catalogState:'UNMATCHED',windows:windows({'14d':{fixtures:3,neither:3}})}),now);
    expect(unmatchedFar.health).toBe('IDLE');expect(unmatchedFar.notes.join(' ')).toContain('seven-day');
  });
  it('D: Betano collapses against its baseline while Betsson stays healthy → DEGRADED BOOKMAKER_COLLAPSE (betano)',()=>{
    const h=classifyCompetition(input({windows:windows({'24h':{fixtures:1,anyOdds:1,betssonReal:1},'3d':{fixtures:9,anyOdds:9,betssonReal:9,proxyOnly:9},'7d':{fixtures:9,anyOdds:9,betssonReal:9,proxyOnly:9},'14d':{fixtures:9,anyOdds:9}}),
      baseline:{evaluatedAt:at(-24),fixtures7d:9,any7d:9,betano7d:9,betsson7d:9,proxy7d:0}}),now);
    expect(h.health).toBe('DEGRADED');
    expect(h.issues.map(i=>i.classification)).toContain('BOOKMAKER_COLLAPSE');expect(h.issues.find(i=>i.classification==='BOOKMAKER_COLLAPSE')?.bookmaker).toBe('betano.bet.br');
    expect(h.issues.map(i=>i.classification)).toContain('PROXY_DOMINANT');
  });
  it('E: both bookmakers collapse against the baseline while fixtures are priced by stale rows only → CRITICAL',()=>{
    const h=classifyCompetition(input({windows:windows({'24h':{fixtures:1,anyOdds:1},'3d':{fixtures:9,anyOdds:9},'7d':{fixtures:9,anyOdds:9},'14d':{fixtures:9,anyOdds:9}}),
      baseline:{evaluatedAt:at(-24),fixtures7d:9,any7d:9,betano7d:9,betsson7d:9,proxy7d:0}}),now);
    expect(h.health).toBe('CRITICAL');expect(h.issues.filter(i=>i.classification==='BOOKMAKER_COLLAPSE')).toHaveLength(2);
  });
  it('F: proxy share jumping from a low baseline to dominant → DEGRADED PROXY_DOMINANT; a feed that was always proxy-heavy is only a note',()=>{
    const proxied=windows({'24h':{fixtures:1,anyOdds:1,betssonReal:1,proxyOnly:1},'3d':{fixtures:12,anyOdds:12,betanoReal:1,betssonReal:11,proxyOnly:12},'7d':{fixtures:12,anyOdds:12,betanoReal:1,betssonReal:11,proxyOnly:12},'14d':{fixtures:12,anyOdds:12}});
    const jumped=classifyCompetition(input({windows:proxied,baseline:{evaluatedAt:at(-24),fixtures7d:12,any7d:12,betano7d:11,betsson7d:11,proxy7d:1}}),now);
    expect(jumped.issues.map(i=>i.classification)).toContain('PROXY_DOMINANT');expect(jumped.health).toBe('DEGRADED');
    const usual=classifyCompetition(input({windows:proxied,baseline:null}),now);
    expect(usual.issues.map(i=>i.classification)).not.toContain('PROXY_DOMINANT');expect(usual.notes.some(n=>n.startsWith('Proxy share'))).toBe(true);
  });
  it('G: finished/off-season competition → IDLE with no incident',()=>{
    const h=classifyCompetition(input({nearestKickoff:null,windows:windows({}),feeds:[feed('betano.bet.br',{lastSuccessAt:at(-30*24)})]}),now);
    expect(h.health).toBe('IDLE');expect(h.issues).toEqual([]);
  });
  it('H: recent success but no evidence either way → UNKNOWN, never "provider absent"',()=>{
    const h=classifyCompetition(input({windows:windows({'24h':{fixtures:1,neither:1},'3d':{fixtures:1,neither:1},'7d':{fixtures:1,neither:1},'14d':{fixtures:1,neither:1}}),
      feeds:[feed('betano.bet.br',{snapshot:null}),feed('betsson',{snapshot:null})]}),now);
    expect(h.health).toBe('UNKNOWN');expect(h.primary).toBe('UNKNOWN');
  });
  it('budget stop on a feed while today\'s fixtures are unpriced → CRITICAL BUDGET_STOPPED; provider auth failure → CRITICAL PROVIDER_AUTH_FAILURE',()=>{
    const budget=classifyCompetition(input({windows:windows({'24h':{fixtures:1,neither:1},'3d':{fixtures:1,neither:1},'7d':{fixtures:1,neither:1},'14d':{fixtures:1,neither:1}}),
      feeds:[feed('betano.bet.br',{consecutiveFailures:2,lastError:'ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED',snapshot:null}),feed('betsson',{snapshot:null})]}),now);
    expect(budget.health).toBe('CRITICAL');expect(budget.primary).toBe('BUDGET_STOPPED');
    const auth=classifyCompetition(input({windows:windows({'3d':{fixtures:2,neither:2},'7d':{fixtures:2,neither:2},'14d':{fixtures:2,neither:2}}),
      feeds:[feed('betano.bet.br',{consecutiveFailures:1,lastError:'ODDSPAPI_HTTP_401',snapshot:null}),feed('betsson',{snapshot:null})]}),now);
    expect(auth.health).toBe('CRITICAL');expect(auth.primary).toBe('PROVIDER_AUTH_FAILURE');expect(auth.providerState).toBe('ERROR');
  });
  it('overdue refresh with coverage still present → DEGRADED REFRESH_NOT_EXECUTED warning; failing target → its error classification',()=>{
    const overdue=classifyCompetition(input({lastSuccessAt:at(-4),feeds:[feed('betano.bet.br',{lastSuccessAt:at(-4)}),feed('betsson',{lastSuccessAt:at(-4)})]}),now);
    expect(overdue.health).toBe('DEGRADED');expect(overdue.primary).toBe('REFRESH_NOT_EXECUTED');
    const failing=classifyCompetition(input({feeds:[feed('betano.bet.br',{consecutiveFailures:3,lastError:'ODDSPAPI_HTTP_503'}),feed('betsson')]}),now);
    expect(failing.health).toBe('DEGRADED');expect(failing.primary).toBe('PROVIDER_TIMEOUT');expect(failing.targetState).toBe('FAILING');
  });
  it('a bookmaker the provider never priced here is a note, not a collapse incident',()=>{
    const h=classifyCompetition(input({windows:windows({'24h':{fixtures:2,anyOdds:1,betanoReal:1,proxyOnly:1,neither:1},'3d':{fixtures:79,anyOdds:60,betanoReal:60,proxyOnly:60,neither:19},'7d':{fixtures:79,anyOdds:60,betanoReal:60,proxyOnly:60,neither:19},'14d':{fixtures:79,anyOdds:60}}),
      feeds:[feed('betano.bet.br'),feed('betsson',{lastSuccessAt:null,consecutiveFailures:2,lastError:'ODDSPAPI_HTTP_404',snapshot:null})]}),now);
    expect(h.issues.map(i=>i.classification)).not.toContain('BOOKMAKER_COLLAPSE');expect(h.notes.some(n=>n.includes('betsson'))).toBe(true);
  });
  it('global: stalled scheduler and provider auth failure are platform CRITICAL issues',()=>{
    expect(classifyGlobal({automationEnabled:true,lastAutomaticInvocationAt:at(-1),lastRequest:{startedAt:at(-0.1),outcome:'HTTP_ERROR',httpStatus:403}},now).map(i=>i.classification)).toEqual(['SCHEDULER_STALLED','PROVIDER_AUTH_FAILURE']);
    expect(classifyGlobal({automationEnabled:true,lastAutomaticInvocationAt:at(-0.1),lastRequest:{startedAt:at(-0.1),outcome:'SUCCEEDED',httpStatus:200}},now)).toEqual([]);
    expect(classifyGlobal({automationEnabled:false,lastAutomaticInvocationAt:null,lastRequest:null},now)).toEqual([]);
    expect(worstHealth(['HEALTHY','DEGRADED','UNMAPPED'])).toBe('UNMAPPED');
  });
  it('model helpers: urgency tiers, per-quote freshness from its own TTL, error code classification',()=>{
    expect([2,10,20,60,150,300,400,null].map(urgencyTier)).toEqual([0,1,2,3,4,5,null,null]);
    expect(freshnessState(at(-0.2),60,now)).toBe('CURRENT');expect(freshnessState(at(-0.6),60,now)).toBe('AGING');expect(freshnessState(at(-0.9),60,now)).toBe('STALE');expect(freshnessState(at(-1.1),60,now)).toBe('EXPIRED');expect(freshnessState(at(-0.1),null,now)).toBe('EXPIRED');
    expect(classifyErrorCode('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED')).toBe('BUDGET_STOPPED');expect(classifyErrorCode('ODDSPAPI_HTTP_429')).toBe('PROVIDER_RATE_LIMITED');expect(classifyErrorCode('ODDSPAPI_NETWORK_ERROR')).toBe('PROVIDER_TIMEOUT');
    expect(classifyErrorCode('ODDS_IDENTITY_CONFLICT')).toBe('MAPPING_FAILED');expect(classifyErrorCode('SOMETHING_ELSE')).toBe('UNKNOWN');expect(classifyErrorCode(null)).toBeNull();
  });
});
