/**
 * P3 odds reliability contract (see docs/ODDS_RELIABILITY_SLO.md).
 * Pure definitions shared by the health engine, the scheduler, the owner control plane and tests.
 */
export const HEALTH_CONTRACT_VERSION='p3.1' as const;

export const HEALTH_STATES=['HEALTHY','DEGRADED','CRITICAL','UPSTREAM_UNAVAILABLE','UNMAPPED','UNKNOWN','IDLE'] as const;
export type HealthState=typeof HEALTH_STATES[number];
/** Order used for "worst first" sorting and overall roll-ups. */
export const HEALTH_RANK:Record<HealthState,number>={CRITICAL:6,UNMAPPED:5,DEGRADED:4,UNKNOWN:3,UPSTREAM_UNAVAILABLE:2,HEALTHY:1,IDLE:0};

/** Provider-truth vs internal-failure classification. Never collapse these into "no odds". */
export const ISSUE_CLASSIFICATIONS=['PROVIDER_NOT_OFFERED','PROVIDER_AUTH_FAILURE','PROVIDER_RATE_LIMITED','PROVIDER_TIMEOUT','PROVIDER_SCHEMA_CHANGE',
  'TARGET_MISSING','MAPPING_FAILED','REFRESH_NOT_EXECUTED','BUDGET_STOPPED','NORMALIZATION_REJECTED','STORE_WRITE_FAILED','FRESHNESS_EXPIRED',
  'CACHE_READ_FAILURE','BOOKMAKER_COLLAPSE','PROXY_DOMINANT','SCHEDULER_STALLED','UNKNOWN'] as const;
export type IssueClassification=typeof ISSUE_CLASSIFICATIONS[number];
export type Severity='WARNING'|'CRITICAL';

/** Time-to-kickoff drives urgency: closer fixtures get stricter freshness, faster recovery and reserved budget. */
export const URGENCY_TIERS=[
  {tier:0,maxHours:3},{tier:1,maxHours:12},{tier:2,maxHours:24},{tier:3,maxHours:72},{tier:4,maxHours:168},{tier:5,maxHours:336},
] as const;
export type UrgencyTier=0|1|2|3|4|5|null;
export function urgencyTier(hoursToKickoff:number|null):UrgencyTier{
  if(hoursToKickoff===null||!Number.isFinite(hoursToKickoff)||hoursToKickoff<=0)return null;
  for(const t of URGENCY_TIERS)if(hoursToKickoff<=t.maxHours)return t.tier;
  return null;
}
/** Longest acceptable age of the last successful refresh per tier (minutes) before a target counts as overdue. */
export const OVERDUE_MINUTES_BY_TIER:Record<Exclude<UrgencyTier,null>,number>={0:45,1:120,2:240,3:480,4:720,5:1440};

/** Quote freshness derived from the stored per-quote TTL, never from one global number. */
export type FreshnessState='CURRENT'|'AGING'|'STALE'|'EXPIRED';
export function freshnessState(observedAt:string|Date,ttlMinutes:number|null,now=new Date()):FreshnessState{
  const observed=new Date(observedAt).getTime();if(!ttlMinutes||ttlMinutes<=0||!Number.isFinite(observed))return 'EXPIRED';
  const age=(now.getTime()-observed)/60000;
  if(age<0)return 'CURRENT';
  if(age<ttlMinutes*0.5)return 'CURRENT';
  if(age<ttlMinutes*0.85)return 'AGING';
  if(age<ttlMinutes)return 'STALE';
  return 'EXPIRED';
}

/** Deterministic anomaly thresholds against the recent baseline (no ML). */
export const COLLAPSE_BASELINE_MIN_FIXTURES=5;
export const COLLAPSE_DROP_RATIO=0.25;   // bookmaker real coverage falling below 25% of its recent baseline
export const PROXY_DOMINANT_RATIO=0.8;    // proxy-only share of priced fixtures
export const PROXY_BASELINE_RATIO=0.4;    // baseline proxy share above which dominance is "normal" for that feed
export const STALE_DOMINANT_RATIO=0.5;
export const SCHEDULER_STALL_MINUTES=20;  // three missed 5-minute ticks

export const CLASSIFICATION_SEVERITY:Record<IssueClassification,Severity>={
  PROVIDER_NOT_OFFERED:'WARNING',PROVIDER_AUTH_FAILURE:'CRITICAL',PROVIDER_RATE_LIMITED:'WARNING',PROVIDER_TIMEOUT:'WARNING',PROVIDER_SCHEMA_CHANGE:'CRITICAL',
  TARGET_MISSING:'CRITICAL',MAPPING_FAILED:'CRITICAL',REFRESH_NOT_EXECUTED:'CRITICAL',BUDGET_STOPPED:'WARNING',NORMALIZATION_REJECTED:'CRITICAL',
  STORE_WRITE_FAILED:'CRITICAL',FRESHNESS_EXPIRED:'WARNING',CACHE_READ_FAILURE:'CRITICAL',BOOKMAKER_COLLAPSE:'WARNING',PROXY_DOMINANT:'WARNING',
  SCHEDULER_STALLED:'CRITICAL',UNKNOWN:'WARNING',
};

/** Map a ledger/provider error code (as persisted on targets and jobs) to a classification. */
export function classifyErrorCode(code:string|null|undefined):IssueClassification|null{
  if(!code)return null;
  if(code.startsWith('ODDS_BUDGET'))return 'BUDGET_STOPPED';
  if(code==='ODDSPAPI_HTTP_404')return 'PROVIDER_NOT_OFFERED';
  if(code==='ODDSPAPI_HTTP_401'||code==='ODDSPAPI_HTTP_403')return 'PROVIDER_AUTH_FAILURE';
  if(code==='ODDSPAPI_HTTP_429')return 'PROVIDER_RATE_LIMITED';
  if(code.startsWith('ODDSPAPI_HTTP_5')||code==='ODDSPAPI_NETWORK_ERROR'||code==='ODDS_RUN_DEADLINE')return 'PROVIDER_TIMEOUT';
  if(code==='ODDS_IDENTITY_CONFLICT'||code==='ODDS_MAPPING_FAILED')return 'MAPPING_FAILED';
  if(code==='ODDS_CATALOG_UNVERIFIED'||code==='ODDSPAPI_TOURNAMENTS_UNUSABLE'||code==='ODDS_SNAPSHOT_UNUSABLE')return 'PROVIDER_SCHEMA_CHANGE';
  if(code==='ODDS_WORKER_LEASE_LOST'||code==='SAFE_WORKER_FAILURE'||code==='ODDS_STORE_WRITE_FAILED')return 'STORE_WRITE_FAILED';
  if(code==='ODDS_DATABASE_UNAVAILABLE')return 'CACHE_READ_FAILURE';
  return 'UNKNOWN';
}
