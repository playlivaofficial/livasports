import type {CompetitionCoverageInput,CoverageWindowCounts} from '../coverage-health';
import {CLASSIFICATION_SEVERITY,COLLAPSE_BASELINE_MIN_FIXTURES,COLLAPSE_DROP_RATIO,HEALTH_RANK,OVERDUE_MINUTES_BY_TIER,PROXY_BASELINE_RATIO,PROXY_DOMINANT_RATIO,
  SCHEDULER_STALL_MINUTES,STALE_DOMINANT_RATIO,classifyErrorCode,urgencyTier,type HealthState,type IssueClassification,type Severity,type UrgencyTier} from './model';

/** Latest provider evidence for one bookmaker feed of a competition (derived from the ledger + applied snapshots). */
export interface FeedEvidence {
  bookmaker:string;
  lastSuccessAt:string|null;lastAttemptAt:string|null;retryAfter:string|null;consecutiveFailures:number;lastError:string|null;
  /** Latest applied snapshot for this feed: what the provider actually returned. */
  snapshot:{observedAt:string;returnedFixtures:number;quotes:number;nearTermFixtures:number;nearTermQuotes:number}|null;
  /** Latest ledger request touching this feed. */
  request:{startedAt:string;outcome:string;httpStatus:number|null}|null;
}
export interface CompetitionBaseline {evaluatedAt:string;fixtures7d:number;any7d:number;betano7d:number;betsson7d:number;proxy7d:number;}
export type CatalogMappingState='MAPPED'|'UNMATCHED'|'AMBIGUOUS'|'DISABLED'|'IGNORED_WITH_REASON'|'NONE';
export interface QuoteAges {p50Minutes:number|null;p95Minutes:number|null;oldestMinutes:number|null;currentQuotes:number;staleQuotes:number;expiredQuotes:number;}
export interface ReliabilityInput extends CompetitionCoverageInput {
  feeds:FeedEvidence[];baseline:CompetitionBaseline|null;catalogState:CatalogMappingState;quoteAges:QuoteAges;
}
export interface HealthIssue {classification:IssueClassification;severity:Severity;evidence:string;affectedFixtures:number;bookmaker?:string;}
export interface CompetitionHealth {
  competition:string;tournamentId:string|null;health:HealthState;tier:UrgencyTier;nearestKickoff:string|null;
  issues:HealthIssue[];notes:string[];primary:IssueClassification|null;
  targetState:'ACTIVE'|'FAILING'|'BACKOFF'|'MISSING';providerState:'OK'|'NOT_OFFERED'|'ERROR'|'UNKNOWN'|'NONE';
  lastSuccessAt:string|null;lastRefreshAgeMinutes:number|null;nextRefreshDueAt:string|null;quoteAges:QuoteAges;catalogState:CatalogMappingState;
}
const minutesSince=(iso:string|null,now:Date)=>iso?Math.round((now.getTime()-Date.parse(iso))/60000):null;
const hours=(iso:string|null,now:Date)=>iso?(Date.parse(iso)-now.getTime())/3600000:null;

function providerHadPricesRecently(feeds:FeedEvidence[],now:Date,withinMinutes:number){
  return feeds.some(f=>f.snapshot&&minutesSince(f.snapshot.observedAt,now)!<=withinMinutes&&f.snapshot.nearTermQuotes>0);
}
function providerReturnedNothingNearTerm(feeds:FeedEvidence[],now:Date,withinMinutes:number){
  const recent=feeds.filter(f=>f.snapshot&&minutesSince(f.snapshot.observedAt,now)!<=withinMinutes);
  return recent.length>0&&recent.every(f=>f.snapshot!.nearTermQuotes===0)&&feeds.every(f=>!f.snapshot||minutesSince(f.snapshot.observedAt,now)!<=withinMinutes||f.snapshot.nearTermQuotes===0);
}
function feedErrorClass(feeds:FeedEvidence[]):{classification:IssueClassification;bookmaker:string;error:string}|null{
  for(const f of feeds){
    if(f.consecutiveFailures>0&&f.lastError){const c=classifyErrorCode(f.lastError);if(c&&c!=='PROVIDER_NOT_OFFERED')return {classification:c,bookmaker:f.bookmaker,error:f.lastError};}
  }
  return null;
}

/**
 * Deterministic health classification for one competition. Provider truth (explicit closes, FIXTURE_NOT_FOUND, a recent
 * snapshot listing no near-term prices) is separated from internal failure (expired quotes while the provider had prices,
 * missing targets, budget stops). Insufficient evidence stays UNKNOWN and is never reported as provider absence.
 */
export function classifyCompetition(input:ReliabilityInput,now=new Date()):CompetitionHealth{
  const w=input.windows,issues:HealthIssue[]=[],notes:string[]=[];
  const nearestHours=hours(input.nearestKickoff,now);const tier=urgencyTier(nearestHours);
  const age=minutesSince(input.lastSuccessAt,now);
  const feeds=input.feeds;
  const base={competition:input.competition,tournamentId:input.tournamentId,tier,nearestKickoff:input.nearestKickoff,lastSuccessAt:input.lastSuccessAt,lastRefreshAgeMinutes:age,
    quoteAges:input.quoteAges,catalogState:input.catalogState,nextRefreshDueAt:null as string|null};
  const providerState=():CompetitionHealth['providerState']=>{
    if(!feeds.length)return 'NONE';
    const err=feedErrorClass(feeds);if(err)return 'ERROR';
    if(feeds.every(f=>classifyErrorCode(f.lastError)==='PROVIDER_NOT_OFFERED'&&f.consecutiveFailures>0))return 'NOT_OFFERED';
    if(feeds.some(f=>f.snapshot))return 'OK';
    return 'UNKNOWN';
  };
  const targetState=():CompetitionHealth['targetState']=>{
    if(!input.tournamentId||!feeds.length)return 'MISSING';
    if(feeds.some(f=>f.consecutiveFailures>=3))return 'FAILING';
    if(feeds.every(f=>f.retryAfter&&Date.parse(f.retryAfter)>now.getTime()))return 'BACKOFF';
    return 'ACTIVE';
  };
  if(w['14d'].fixtures===0)return {...base,health:'IDLE',issues,notes:['No scheduled fixtures inside 14 days'],primary:null,targetState:targetState(),providerState:providerState()};

  // 1. No scheduler target at all.
  if(!input.tournamentId){
    const soon=w['7d'].fixtures;
    if(input.catalogState==='AMBIGUOUS')issues.push({classification:'MAPPING_FAILED',severity:soon?'CRITICAL':'WARNING',evidence:'Provider catalog lists more than one candidate row; mapping needs a registry rule',affectedFixtures:w['14d'].fixtures});
    else issues.push({classification:'TARGET_MISSING',severity:soon?'CRITICAL':'WARNING',evidence:input.catalogState==='UNMATCHED'?'Provider catalog row exists but no rule or lookup name resolves it':'No provider catalog row resolves to this competition (automatic catalog expansion pending)',affectedFixtures:w['14d'].fixtures});
    const health:HealthState=input.catalogState==='AMBIGUOUS'||input.catalogState==='UNMATCHED'?'UNMAPPED':soon?'CRITICAL':'DEGRADED';
    return {...base,health,issues,notes,primary:issues[0].classification,targetState:'MISSING',providerState:'NONE'};
  }

  // 2. Zero coverage in the commercial windows: internal gap vs provider truth vs unknown.
  const zero=(win:CoverageWindowCounts)=>win.fixtures>0&&win.anyOdds===0;
  const zeroToday=zero(w['24h']),zeroNear=!zeroToday&&zero(w['3d']);
  if(zeroToday||zeroNear){
    const win=zeroToday?w['24h']:w['3d'];const severity:Severity=zeroToday?'CRITICAL':'WARNING';
    const overdue=OVERDUE_MINUTES_BY_TIER[(tier??3) as 0|1|2|3|4|5];
    const err=feedErrorClass(feeds);
    const expiredActive=win.staleOnly-win.closedOnly;
    if(err&&err.classification==='BUDGET_STOPPED')issues.push({classification:'BUDGET_STOPPED',severity,evidence:`Ledger refused refreshes for ${err.bookmaker} while ${win.fixtures} fixture(s) are unpriced`,affectedFixtures:win.fixtures,bookmaker:err.bookmaker});
    else if(err)issues.push({classification:err.classification,severity:CLASSIFICATION_SEVERITY[err.classification]==='CRITICAL'?'CRITICAL':severity,evidence:`Last provider error ${err.error} on ${err.bookmaker}`,affectedFixtures:win.fixtures,bookmaker:err.bookmaker});
    else if(expiredActive>0||providerHadPricesRecently(feeds,now,overdue*2))issues.push({classification:'REFRESH_NOT_EXECUTED',severity,evidence:expiredActive>0?`${expiredActive} fixture(s) hold provider prices that expired before a refresh`:'Provider returned near-term prices recently but no current quote is stored',affectedFixtures:win.fixtures});
    else if(win.closedOnly===win.fixtures&&win.fixtures>0)issues.push({classification:'PROVIDER_NOT_OFFERED',severity:'WARNING',evidence:'Provider explicitly closed every market for these fixtures',affectedFixtures:win.fixtures});
    else if(feeds.length&&feeds.every(f=>classifyErrorCode(f.lastError)==='PROVIDER_NOT_OFFERED'&&f.consecutiveFailures>0))issues.push({classification:'PROVIDER_NOT_OFFERED',severity:'WARNING',evidence:'Provider reports FIXTURE_NOT_FOUND for every bookmaker feed',affectedFixtures:win.fixtures});
    else if(providerReturnedNothingNearTerm(feeds,now,overdue))issues.push({classification:'PROVIDER_NOT_OFFERED',severity:'WARNING',evidence:'Recent successful refresh listed no near-term prices for this tournament',affectedFixtures:win.fixtures});
    else if(age===null||age>overdue)issues.push({classification:'REFRESH_NOT_EXECUTED',severity,evidence:age===null?'Target never refreshed successfully':`Last successful refresh ${age} min ago exceeds the ${overdue} min tier allowance`,affectedFixtures:win.fixtures});
    else issues.push({classification:'UNKNOWN',severity,evidence:'Refresh succeeded recently but the stored evidence cannot separate a provider gap from an internal one',affectedFixtures:win.fixtures});
  }

  // 3. Bookmaker collapse against the recent baseline (peer comparison only as a fallback with no baseline).
  const seven=w['7d'];
  if(seven.fixtures>=COLLAPSE_BASELINE_MIN_FIXTURES){
    const b=input.baseline;
    const collapsed=(current:number,baseline:number|null,peer:number)=>{
      if(b&&baseline!==null&&baseline>=COLLAPSE_BASELINE_MIN_FIXTURES){const expected=baseline*Math.min(1,seven.fixtures/Math.max(1,b.fixtures7d));return current<expected*COLLAPSE_DROP_RATIO;}
      return !b&&peer>=COLLAPSE_BASELINE_MIN_FIXTURES&&current===0;
    };
    const betanoDown=collapsed(seven.betanoReal,b?b.betano7d:null,seven.betssonReal),betssonDown=collapsed(seven.betssonReal,b?b.betsson7d:null,seven.betanoReal);
    const notOffered=(book:string)=>feeds.find(f=>f.bookmaker===book&&f.consecutiveFailures>0&&classifyErrorCode(f.lastError)==='PROVIDER_NOT_OFFERED');
    for(const [book,down] of [['betano.bet.br',betanoDown],['betsson',betssonDown]] as const){
      if(!down)continue;
      const truth=notOffered(book);
      if(truth&&!b)notes.push(`${book}: provider reports no fixtures for this tournament (never priced here)`);
      else issues.push({classification:truth?'PROVIDER_NOT_OFFERED':'BOOKMAKER_COLLAPSE',severity:betanoDown&&betssonDown?'CRITICAL':'WARNING',bookmaker:book,
        evidence:b?`${book} real coverage ${book==='betsson'?seven.betssonReal:seven.betanoReal}/${seven.fixtures} vs baseline ${book==='betsson'?b.betsson7d:b.betano7d}/${b.fixtures7d} (${b.evaluatedAt})`:`${book} has no real prices while the other bookmaker prices ${Math.max(seven.betanoReal,seven.betssonReal)} fixtures`,affectedFixtures:seven.fixtures});
    }
    if(seven.anyOdds>=COLLAPSE_BASELINE_MIN_FIXTURES){
      const share=seven.proxyOnly/seven.anyOdds;
      if(share>PROXY_DOMINANT_RATIO){
        const baseShare=b&&b.any7d>0?b.proxy7d/b.any7d:null;
        if(baseShare!==null&&baseShare<PROXY_BASELINE_RATIO)issues.push({classification:'PROXY_DOMINANT',severity:'WARNING',evidence:`Proxy share ${Math.round(share*100)}% vs baseline ${Math.round(baseShare*100)}%`,affectedFixtures:seven.proxyOnly});
        else if(baseShare===null)notes.push(`Proxy share ${Math.round(share*100)}% (no 24h baseline yet)`);
      }
    }
    const staleActive=seven.staleOnly-seven.closedOnly;
    if(!zeroToday&&!zeroNear&&staleActive/seven.fixtures>STALE_DOMINANT_RATIO)issues.push({classification:'FRESHNESS_EXPIRED',severity:'WARNING',evidence:`${staleActive}/${seven.fixtures} fixtures hold only expired quotes`,affectedFixtures:staleActive});
  }

  // 4. Target failing / overdue while coverage still exists.
  const err=feedErrorClass(feeds);
  if(err&&!issues.some(i=>i.classification===err.classification)&&feeds.some(f=>f.bookmaker===err.bookmaker&&f.consecutiveFailures>=3))
    issues.push({classification:err.classification,severity:CLASSIFICATION_SEVERITY[err.classification]==='CRITICAL'?'CRITICAL':'WARNING',bookmaker:err.bookmaker,evidence:`${err.bookmaker} failed ${feeds.find(f=>f.bookmaker===err.bookmaker)!.consecutiveFailures} consecutive refreshes (${err.error})`,affectedFixtures:seven.fixtures});
  if(tier!==null&&age!==null&&age>OVERDUE_MINUTES_BY_TIER[tier]&&!issues.some(i=>i.classification==='REFRESH_NOT_EXECUTED'))
    issues.push({classification:'REFRESH_NOT_EXECUTED',severity:'WARNING',evidence:`Last successful refresh ${age} min ago exceeds the tier ${tier} allowance of ${OVERDUE_MINUTES_BY_TIER[tier]} min`,affectedFixtures:w['24h'].fixtures||w['3d'].fixtures});

  // Health roll-up: internal CRITICAL beats everything; insufficient evidence stays UNKNOWN; provider-only absence is UPSTREAM_UNAVAILABLE.
  const internalCritical=issues.some(i=>i.severity==='CRITICAL'&&i.classification!=='PROVIDER_NOT_OFFERED'&&i.classification!=='UNKNOWN');
  const unknownOnly=issues.some(i=>i.classification==='UNKNOWN')&&issues.every(i=>i.classification==='UNKNOWN'||i.classification==='PROVIDER_NOT_OFFERED');
  const upstreamOnly=issues.length>0&&issues.every(i=>i.classification==='PROVIDER_NOT_OFFERED');
  const health:HealthState=internalCritical?'CRITICAL':unknownOnly?'UNKNOWN':upstreamOnly?'UPSTREAM_UNAVAILABLE':issues.length?'DEGRADED':'HEALTHY';
  const primary=[...issues].sort((a,b)=>Number(b.severity==='CRITICAL')-Number(a.severity==='CRITICAL'))[0]?.classification??null;
  return {...base,health,issues,notes,primary,targetState:targetState(),providerState:providerState()};
}

export interface GlobalSignals {lastAutomaticInvocationAt:string|null;automationEnabled:boolean;lastRequest:{startedAt:string;outcome:string;httpStatus:number|null}|null;}
/** Platform-wide conditions that are not a property of one competition. */
export function classifyGlobal(signals:GlobalSignals,now=new Date()):HealthIssue[]{
  const issues:HealthIssue[]=[];
  const age=minutesSince(signals.lastAutomaticInvocationAt,now);
  if(signals.automationEnabled&&(age===null||age>SCHEDULER_STALL_MINUTES))issues.push({classification:'SCHEDULER_STALLED',severity:'CRITICAL',evidence:age===null?'No automatic scheduler invocation recorded':`Last automatic scheduler invocation ${age} min ago`,affectedFixtures:0});
  if(signals.lastRequest&&(signals.lastRequest.httpStatus===401||signals.lastRequest.httpStatus===403))issues.push({classification:'PROVIDER_AUTH_FAILURE',severity:'CRITICAL',evidence:`Latest provider request returned HTTP ${signals.lastRequest.httpStatus}`,affectedFixtures:0});
  return issues;
}
export const worstHealth=(states:readonly HealthState[]):HealthState=>states.reduce<HealthState>((worst,s)=>HEALTH_RANK[s]>HEALTH_RANK[worst]?s:worst,'IDLE');
