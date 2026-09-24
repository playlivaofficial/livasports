/**
 * SEO monitoring — pure logic. No IO, no database, no network, so the thresholds are testable and
 * reviewable in one place. The crawl lives in `monitoring-server.ts` and Search Console in `gsc.ts`.
 *
 * There is deliberately no composite "SEO score": every judgement below is a named threshold against a
 * measured value, so an owner can see exactly what tripped and why.
 */
import type {RouteFamily} from './policy';

/** Families we submit. Anything outside this set appearing in a sitemap is itself a finding. */
export const SUBMITTED_FAMILIES=['home','football','live','today','competition','match','team','content'] as const;
export type SubmittedFamily=typeof SUBMITTED_FAMILIES[number];

export interface SeoSnapshot {
  capturedAt:string;
  submittedTotal:number;
  families:Partial<Record<SubmittedFamily,number>>;
  locales:Record<string,number>;
  sampled:number;
  problems:SeoProblem[];
  robotsOk:boolean|null;
}
export type SeoProblemType='REDIRECT_IN_SITEMAP'|'ERROR_IN_SITEMAP'|'NOINDEX_IN_SITEMAP'|'CANONICAL_MISMATCH'
  |'CANONICAL_MISSING'|'HREFLANG_NOT_RECIPROCAL'|'HREFLANG_TO_NON_200'|'STRUCTURED_DATA_MISSING'|'SITEMAP_UNREACHABLE';
export interface SeoProblem {type:SeoProblemType;url:string;detail?:string;family?:string}

/**
 * Thresholds. Percentages are fractions of the previous snapshot. They are intentionally wide: a sitemap
 * that tracks a rolling fixture window moves every day, and a monitor that cries wolf gets ignored.
 */
export const SEO_THRESHOLDS={
  /** Submitted-URL growth beyond this fraction is possible index bloat returning. */
  submittedGrowth:0.25,
  /** Submitted-URL loss beyond this fraction means inventory silently left the index. */
  submittedDrop:0.20,
  /** Any single family moving more than this is reported even when the total looks stable. */
  familyDrift:0.35,
  /** Locale counts should stay within this fraction of each other; the three locales mirror each other. */
  localeSkew:0.05,
  /** Sampled problem rate above this is a technical regression, not noise. */
  problemRate:0.02,
  /** Search Console comparisons (used once a credential exists). */
  clicksDrop:0.30,impressionsDrop:0.30,positionWorsening:3,
  /** CTR below this at a page-one-ish position is a title/description opportunity, not a defect. */
  weakCtr:0.02,nearPageOneFrom:8,nearPageOneTo:20,minImpressionsForOpportunity:50,
} as const;

export type AlertSeverity='CRITICAL'|'WARNING'|'INFO';
export interface SeoAlert {code:string;severity:AlertSeverity;urlFamily:string|null;reason:string;current:string;baseline:string}

const pct=(current:number,baseline:number)=>baseline===0?(current===0?0:1):(current-baseline)/baseline;
const fmtPct=(v:number)=>`${v>=0?'+':''}${Math.round(v*1000)/10}%`;

/**
 * Compare a fresh snapshot with the previous one. `previous` is null on the very first run, where only
 * absolute conditions can fire — a first snapshot must never invent a regression against nothing.
 */
export function deriveSeoAlerts(current:SeoSnapshot,previous:SeoSnapshot|null,thresholds=SEO_THRESHOLDS):SeoAlert[]{
  const alerts:SeoAlert[]=[];
  const add=(a:SeoAlert)=>{alerts.push(a);};

  // Absolute conditions: true regardless of history.
  if(current.robotsOk===false)add({code:'ROBOTS_UNHEALTHY',severity:'CRITICAL',urlFamily:null,
    reason:'robots.txt did not serve both sitemap declarations',current:'unhealthy',baseline:'healthy'});
  if(current.submittedTotal===0)add({code:'SITEMAP_EMPTY',severity:'CRITICAL',urlFamily:null,
    reason:'No URLs are being submitted at all',current:'0',baseline:previous?String(previous.submittedTotal):'unknown'});

  const byType=new Map<SeoProblemType,SeoProblem[]>();
  for(const p of current.problems)byType.set(p.type,[...(byType.get(p.type)??[]),p]);
  const critical:SeoProblemType[]=['ERROR_IN_SITEMAP','NOINDEX_IN_SITEMAP','REDIRECT_IN_SITEMAP','SITEMAP_UNREACHABLE'];
  for(const [type,items] of byType){
    const severity:AlertSeverity=critical.includes(type)?'CRITICAL':'WARNING';
    add({code:type,severity,urlFamily:items[0].family??null,
      reason:`${items.length} sampled URL(s): ${items[0].url}${items[0].detail?` (${items[0].detail})`:''}`,
      current:String(items.length),baseline:'0'});
  }
  if(current.sampled>0){
    const rate=current.problems.length/current.sampled;
    if(rate>thresholds.problemRate)add({code:'PROBLEM_RATE_HIGH',severity:'WARNING',urlFamily:null,
      reason:`${Math.round(rate*1000)/10}% of sampled URLs had a technical problem`,
      current:`${current.problems.length}/${current.sampled}`,baseline:`<= ${thresholds.problemRate*100}%`});
  }
  // The three locales mirror each other by construction; a skew means one locale stopped being emitted.
  const localeCounts=Object.values(current.locales);
  if(localeCounts.length>1){
    const max=Math.max(...localeCounts),min=Math.min(...localeCounts);
    if(max>0&&(max-min)/max>thresholds.localeSkew)add({code:'LOCALE_SKEW',severity:'WARNING',urlFamily:null,
      reason:'Locale sitemap counts diverged; one locale may have stopped being submitted',
      current:JSON.stringify(current.locales),baseline:'balanced'});
  }
  if(!previous)return alerts;

  const growth=pct(current.submittedTotal,previous.submittedTotal);
  if(growth>thresholds.submittedGrowth)add({code:'SUBMITTED_URLS_SPIKE',severity:'WARNING',urlFamily:null,
    reason:`Submitted URLs grew ${fmtPct(growth)}; check for index bloat returning`,
    current:String(current.submittedTotal),baseline:String(previous.submittedTotal)});
  if(-growth>thresholds.submittedDrop)add({code:'SUBMITTED_URLS_DROP',severity:'CRITICAL',urlFamily:null,
    reason:`Submitted URLs fell ${fmtPct(growth)}; indexable inventory may have been lost`,
    current:String(current.submittedTotal),baseline:String(previous.submittedTotal)});

  for(const family of SUBMITTED_FAMILIES){
    const now=current.families[family]??0,before=previous.families[family]??0;
    if(before===0&&now===0)continue;
    const drift=pct(now,before);
    if(Math.abs(drift)>thresholds.familyDrift)add({code:'FAMILY_DRIFT',severity:before>0&&now===0?'CRITICAL':'WARNING',
      urlFamily:family,reason:`${family} submission moved ${fmtPct(drift)}`,current:String(now),baseline:String(before)});
  }
  return alerts;
}

export type ScorecardBucket='WINS'|'WATCHLIST'|'ISSUES';
export interface ScorecardEntry {bucket:ScorecardBucket;code:string;statement:string;current:string;baseline:string}

/**
 * Weekly scorecard. Evidence is classified, never scored: an owner reads what changed, by how much,
 * against what baseline. Search Console lines only appear when a credential actually supplied data.
 */
export function buildSeoScorecard(current:SeoSnapshot,previous:SeoSnapshot|null,alerts:SeoAlert[],
  gsc:{state:string;clicks?:number;impressions?:number;ctr?:number;position?:number;previous?:{clicks:number;impressions:number;ctr:number;position:number}}
  ={state:'NOT_CONNECTED'}):ScorecardEntry[]{
  const entries:ScorecardEntry[]=[];
  for(const alert of alerts.filter(a=>a.severity==='CRITICAL'))
    entries.push({bucket:'ISSUES',code:alert.code,statement:alert.reason,current:alert.current,baseline:alert.baseline});
  for(const alert of alerts.filter(a=>a.severity==='WARNING'))
    entries.push({bucket:'WATCHLIST',code:alert.code,statement:alert.reason,current:alert.current,baseline:alert.baseline});

  if(current.sampled>0&&!current.problems.length)
    entries.push({bucket:'WINS',code:'TECHNICAL_CLEAN',statement:'Every sampled submitted URL returned 200, indexable, with a self-referential canonical',
      current:`${current.sampled} sampled`,baseline:'0 problems'});
  if(previous&&current.submittedTotal>0){
    const growth=pct(current.submittedTotal,previous.submittedTotal);
    if(Math.abs(growth)<=SEO_THRESHOLDS.familyDrift)
      entries.push({bucket:'WINS',code:'SUBMISSION_STABLE',statement:`Submitted inventory stable at ${fmtPct(growth)}`,
        current:String(current.submittedTotal),baseline:String(previous.submittedTotal)});
  }
  if(gsc.state!=='CONNECTED'){
    entries.push({bucket:'ISSUES',code:'GSC_NOT_CONNECTED',
      statement:'Search Console is not connected, so clicks, impressions, CTR and position cannot be reported',
      current:gsc.state,baseline:'CONNECTED'});
    return entries;
  }
  const p=gsc.previous;
  if(p&&typeof gsc.clicks==='number'&&typeof gsc.impressions==='number'){
    const clicks=pct(gsc.clicks,p.clicks),impressions=pct(gsc.impressions,p.impressions);
    if(clicks>0)entries.push({bucket:'WINS',code:'CLICKS_UP',statement:`Clicks grew ${fmtPct(clicks)}`,current:String(gsc.clicks),baseline:String(p.clicks)});
    if(-clicks>SEO_THRESHOLDS.clicksDrop)entries.push({bucket:'ISSUES',code:'CLICKS_DOWN',statement:`Clicks fell ${fmtPct(clicks)}`,current:String(gsc.clicks),baseline:String(p.clicks)});
    if(impressions>0)entries.push({bucket:'WINS',code:'IMPRESSIONS_UP',statement:`Impressions grew ${fmtPct(impressions)}`,current:String(gsc.impressions),baseline:String(p.impressions)});
    if(-impressions>SEO_THRESHOLDS.impressionsDrop)entries.push({bucket:'ISSUES',code:'IMPRESSIONS_DOWN',statement:`Impressions fell ${fmtPct(impressions)}`,current:String(gsc.impressions),baseline:String(p.impressions)});
    if(typeof gsc.ctr==='number'&&gsc.ctr<SEO_THRESHOLDS.weakCtr&&gsc.impressions>=SEO_THRESHOLDS.minImpressionsForOpportunity)
      entries.push({bucket:'WATCHLIST',code:'WEAK_CTR',statement:'Impressions are arriving but CTR is weak; titles and descriptions are the lever',
        current:`${Math.round((gsc.ctr??0)*1000)/10}%`,baseline:`>= ${SEO_THRESHOLDS.weakCtr*100}%`});
  }
  return entries;
}

/** Route families we deliberately never submit. Used by the audit view to explain absence as intent. */
export const INTENTIONALLY_UNSUBMITTED:ReadonlyArray<{family:RouteFamily;why:string}>=[
  {family:'player',why:'Crawlable and indexable, but never submitted: the largest, least commercial slice of inventory (M1)'},
  {family:'search',why:'Internal search results are not a search landing page'},
  {family:'myMatches',why:'Personalised feed'},
  {family:'account',why:'Authenticated'},
  {family:'signin',why:'Authentication utility'},
  {family:'owner',why:'Owner tooling, disallowed in robots.txt'},
  {family:'api',why:'JSON endpoints, disallowed in robots.txt'},
  {family:'go',why:'Affiliate redirects, disallowed in robots.txt'},
  {family:'pending',why:'Fixture without drawn participants has no content yet'},
];
