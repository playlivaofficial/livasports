import {createHash} from 'node:crypto';

/** Deliberately independent of editorial publishing thresholds. No environment-driven secret inputs. */
export const SEO_OPTIMIZATION = {
  version:'GROWTH_V2_1',optimizationEnabled:true,titleOptimizationEnabled:true,metaOptimizationEnabled:true,
  linkBoostEnabled:true,clusterLearningEnabled:true,rollbackEnabled:true,
  maxAutomaticTitleChangesPerDay:1,maxAutomaticMetaChangesPerDay:1,maxAutomaticLinkBoostsPerDay:3,
  maxClusterWeightChangePerWeek:1,minimumImpressionsForTitleTest:500,minimumDaysObserved:7,
  minimumExperimentSample:200,metadataCooldownDays:28,rollbackCooldownDays:56,
  minimumHighConfidenceDays:28,minimumCohortSize:5,maxLinkBoost:5,maxClusterAdjustment:3,
  maxExperimentsPerRun:6,maxActionsPerRun:4,signalExpiryDays:14,
} as const;
export type Confidence='LOW'|'MEDIUM'|'HIGH';
export type PageType='FIXTURE'|'TEAM'|'COMPETITION'|'HUB'|'OTHER';
export type Detector='STRIKING_DISTANCE'|'LOW_CTR'|'WINNING_PAGE'|'DECAYING_WINNER'|'LOW_VALUE';
export interface Metric {impressions:number;clicks:number;position:number;days:number;ctr:number;positionSpread:number}
export interface QueryMetric {query:string;impressions:number;clicks:number;position:number;days:number}
export interface GrowthPage {
  url:string;type:PageType;locale:string;entityId:string|null;cluster:string|null;label:string;
  current:Metric;previous:Metric;queries:QueryMetric[];countries:unknown[];devices:unknown[];
  publishedAt:string|null;lastChangedAt:string|null;firstObserved:string|null;
  managed:boolean;status:string|null;technicalHealthy:boolean;fresh:boolean;activeExperiment:boolean;
  title:string|null;description:string|null;linkBoost:number;
  coverageDays?:number;
  kickoff?:string|null;
  optimizationMetadata?:unknown;
  hasResult?:boolean;
}
export interface Opportunity {url:string;detector:Detector;confidence:Confidence;reason:string;query:string|null;
  proposedAction:string;benchmark:number|null;cohortSize:number;evidence:GrowthPage}
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function classifyBrand(query:string):'BRAND'|'NON_BRAND'|'UNKNOWN'{
  const q=normalize(query);if(!q)return 'UNKNOWN';
  if(/\b(liva\s*sports?|livva\s*sports?|livasprots|livasportz)\b/.test(q))return 'BRAND';
  if(/\bliva\b|https?|www|[^\p{L}\p{N}\s.,'-]/u.test(query)||q.length<4)return 'UNKNOWN';
  return /\b(futebol|futbol|football|soccer|jogo|jogos|match|matches|partido|liga|league|fc|sc|club|clube|vs|santos|flamengo|palmeiras|corinthians|botafogo)\b/.test(q)?'NON_BRAND':'UNKNOWN';
}
export function pageType(url:string):PageType{
  try{const parsed=new URL(url),p=parsed.pathname;
    if(/\/(jogo|partido|match)\//.test(p))return 'FIXTURE';
    if(/\/(time|equipo|team)\//.test(p))return 'TEAM';
    if(/\/(competicao|competicion|competition|league)\//.test(p)||(/\/(futebol|futbol|football)$/.test(p)&&parsed.searchParams.has('competition')))return 'COMPETITION';
    if(/^\/(br|mx|en)(\/(futebol|futbol|football|jogos\/hoje|partidos\/hoy|matches\/today))?$/.test(p))return 'HUB';
  }catch{/* Invalid URLs cannot qualify. */}return 'OTHER';
}
export function queryRelevant(query:string,label:string){
  const stop=new Set(['club','clube','football','futebol','jogo','match','partido','de','da','do','the']);
  const terms=normalize(label).split(' ').filter(t=>t.length>=3&&!stop.has(t));
  const tokens=new Set(normalize(query).split(' '));return terms.some(t=>tokens.has(t));
}
export function queryIntent(query:string):'H2H'|'FORM'|'STANDINGS'|'SCHEDULE'|'GENERAL'{
  const q=normalize(query);return /confront|retrospect|h2h|head to head/.test(q)?'H2H':/classific|standings|tabla|tabela/.test(q)?'STANDINGS':/forma|form|ultim|result/.test(q)?'FORM':/proxim|upcoming|horario|quando|when|schedule/.test(q)?'SCHEDULE':'GENERAL';
}
export function metricValid(m:Metric){return [m.impressions,m.clicks,m.position,m.days,m.ctr,m.positionSpread].every(Number.isFinite)&&m.impressions>=0&&m.clicks>=0&&m.clicks<=m.impressions&&m.ctr>=0&&m.ctr<=1&&m.position>=0&&m.days>=0;}
export function optimizationSafety(input:{connected:boolean;complete:boolean;latestDay:string|null;expectedDay:string;observedDays:number;valid:boolean;dailyImpressions:number[]}){
  const reasons:string[]=[];
  if(!input.connected)reasons.push('GSC_SYNC_FAILED_OR_STALE');if(!input.complete)reasons.push('GSC_INCOMPLETE');
  if(!input.latestDay||input.latestDay<input.expectedDay)reasons.push('GSC_REPORTING_GAP');
  if(input.observedDays<SEO_OPTIMIZATION.minimumDaysObserved)reasons.push('INSUFFICIENT_OBSERVED_DAYS');
  if(!input.valid)reasons.push('CORRUPT_METRICS');
  const values=input.dailyImpressions.slice(-8),prior=values.slice(0,-1).sort((a,b)=>a-b),median=prior[Math.floor(prior.length/2)]??0;
  if(prior.length>=5&&median>0&&(values.at(-1)!>median*5||values.at(-1)!<median*.1))reasons.push('UNEXPLAINED_TRAFFIC_ANOMALY');
  if(!SEO_OPTIMIZATION.optimizationEnabled)reasons.push('DISABLED');
  return {mode:reasons.length?'OBSERVE_ONLY' as const:'ACTIVE' as const,reasons};
}
const bucket=(p:GrowthPage)=>`${p.type}:${p.locale}:${Math.floor(p.current.position/5)}:${queryIntent(p.queries[0]?.query??'')}`;
export function detectGrowthOpportunities(pages:GrowthPage[],now:Date):Opportunity[]{
  const result:Opportunity[]=[];
  const cohorts=new Map<string,GrowthPage[]>();
  for(const p of pages){if(p.current.impressions<100||p.current.days<7||!metricValid(p.current))continue;const key=bucket(p);const list=cohorts.get(key)??[];list.push(p);cohorts.set(key,list);}
  for(const p of [...pages].sort((a,b)=>a.url.localeCompare(b.url))){
    if(!metricValid(p.current)||!metricValid(p.previous))continue;
    const relevant=p.queries.filter(q=>queryRelevant(q.query,p.label)).sort((a,b)=>b.impressions-a.impressions)[0];
    const peers=(cohorts.get(bucket(p))??[]).filter(x=>x.url!==p.url);
    const sample=peers.reduce((s,x)=>s+x.current.impressions,0),ctr=sample?peers.reduce((s,x)=>s+x.current.clicks,0)/sample:null;
    const medium=p.current.days>=7&&p.current.impressions>=50&&!!relevant&&p.current.positionSpread<=5;
    const high=medium&&p.current.days>=SEO_OPTIMIZATION.minimumHighConfidenceDays&&p.current.impressions>=SEO_OPTIMIZATION.minimumImpressionsForTitleTest&&p.previous.days>=28&&peers.length>=SEO_OPTIMIZATION.minimumCohortSize&&p.current.positionSpread<=3&&relevant.days>=7;
    const confidence:Confidence=high?'HIGH':medium?'MEDIUM':'LOW';
    const add=(detector:Detector,reason:string,action:string)=>result.push({url:p.url,detector,confidence,reason,proposedAction:action,query:relevant?.query??null,benchmark:ctr,cohortSize:peers.length,evidence:p});
    const stable=p.previous.days>=7&&p.current.impressions/Math.max(1,p.current.days)>=.9*p.previous.impressions/p.previous.days;
    if(p.current.impressions>=30&&p.current.position>=8&&p.current.position<=20)add('STRIKING_DISTANCE',stable&&relevant?'Relevant query, stable demand and page-one proximity':'Discovery only: demand history or query relevance insufficient',stable&&medium?'INTERNAL_LINK_BOOST':'OBSERVE');
    if(p.current.impressions>=100&&p.current.position>=3&&p.current.position<=20&&ctr!==null&&peers.length>=5&&p.current.ctr<ctr*.6)
      add('LOW_CTR','CTR below same-type, locale, intent and position-band peers; not proof of snippet causation',high?'TITLE_PATTERN':'OBSERVE');
    else if(p.current.impressions>=100&&p.current.position>=3&&p.current.position<=20&&p.current.clicks===0&&peers.length<5)
      result.push({url:p.url,detector:'LOW_CTR',confidence:'LOW',reason:'Zero reported clicks despite impressions; insufficient comparable peers to establish underperformance',query:relevant?.query??null,proposedAction:'OBSERVE',benchmark:null,cohortSize:peers.length,evidence:p});
    if(p.current.days>=7&&p.previous.days>=7&&p.previous.impressions>=100&&p.current.impressions/p.current.days>p.previous.impressions/p.previous.days*1.2&&p.current.clicks/p.current.days>p.previous.clicks/p.previous.days&&p.current.position<=p.previous.position)
      add('WINNING_PAGE','Comparable daily demand and clicks grew without ranking deterioration','CLUSTER_REVIEW');
    if(p.previous.days>=7&&p.previous.clicks>=3&&p.previous.impressions>=100&&p.current.days>=7&&(p.current.impressions/p.current.days<p.previous.impressions/p.previous.days*.65||p.current.position>p.previous.position+4))
      add('DECAYING_WINNER',`Investigate lifecycle (${p.status??'unknown'}), freshness (${p.fresh}), technical health (${p.technicalHealthy}), intent and seasonality before intervention`,'DIAGNOSE_ONLY');
    if(p.publishedAt&&now.getTime()-Date.parse(p.publishedAt)>90*86400000&&(p.coverageDays??p.current.days)>=28&&p.current.impressions<10)
      add('LOW_VALUE','Mature page with low observed demand: reduce future effort only; never delete or change robots','RESOURCE_REVIEW');
  }
  return result.sort((a,b)=>b.evidence.current.impressions-a.evidence.current.impressions||a.url.localeCompare(b.url)||a.detector.localeCompare(b.detector));
}
export function seoLinkBoostScore(o:Opportunity){return o.detector==='STRIKING_DISTANCE'&&o.proposedAction==='INTERNAL_LINK_BOOST'&&o.confidence!=='LOW'?Math.min(5,Math.max(1,Math.round(Math.log10(1+o.evidence.current.impressions)))):0;}
/** Absolute target with bounded movement; never recursively multiply the original editorial score. */
export function seoPerformanceWeightAdjustment(previous:number,winners:number,losers:number,qualifiedPages:number,complete:boolean){
  if(!complete)return previous;
  const target=qualifiedPages>=3?(winners>=3&&winners>losers?3:losers>=3&&losers>winners?-2:0):0;
  return Math.max(-3,Math.min(3,previous+Math.sign(target-previous)*Math.min(Math.abs(target-previous),SEO_OPTIMIZATION.maxClusterWeightChangePerWeek)));
}
export function experimentArm(key:string){return parseInt(createHash('sha256').update(key).digest('hex').slice(0,8),16)%2===0?'CONTROL':'VARIANT';}
export function actionGate(p:GrowthPage,kind:'TITLE_PATTERN'|'INTERNAL_LINK_BOOST',confidence:Confidence,now:Date,used:number,mode:string){
  if(mode!=='ACTIVE')return 'OBSERVE_ONLY';
  if(!p.managed||p.locale!=='br'||!p.technicalHealthy||!p.fresh)return 'UNSAFE_OR_UNMANAGED_PAGE';
  if(p.status==='SCHEDULED'&&p.kickoff&&Date.parse(p.kickoff)<=now.getTime())return 'STALE_LIFECYCLE';
  if(kind==='TITLE_PATTERN'&&p.status==='FINISHED'&&!p.hasResult)return 'RESULT_UNVERIFIED';
  if(p.activeExperiment)return 'EXPERIMENT_CONFLICT';
  if(p.lastChangedAt&&now.getTime()-Date.parse(p.lastChangedAt)<SEO_OPTIMIZATION.metadataCooldownDays*86400000)return 'COOLDOWN';
  if(kind==='TITLE_PATTERN'&&(confidence!=='HIGH'||!SEO_OPTIMIZATION.titleOptimizationEnabled||!SEO_OPTIMIZATION.metaOptimizationEnabled))return 'METADATA_CONFIDENCE_OR_DISABLED';
  if(kind==='INTERNAL_LINK_BOOST'&&(confidence==='LOW'||!SEO_OPTIMIZATION.linkBoostEnabled))return 'LINK_CONFIDENCE_OR_DISABLED';
  if(used>=(kind==='TITLE_PATTERN'?Math.min(SEO_OPTIMIZATION.maxAutomaticTitleChangesPerDay,SEO_OPTIMIZATION.maxAutomaticMetaChangesPerDay):SEO_OPTIMIZATION.maxAutomaticLinkBoostsPerDay))return 'DAILY_CAP';
  return 'ELIGIBLE';
}
export function assessExperiment(before:Metric,after:Metric,controlBefore:Metric,controlAfter:Metric,days:number){
  if(days<7||[before,after,controlBefore,controlAfter].some(m=>!metricValid(m)||m.impressions<SEO_OPTIMIZATION.minimumExperimentSample||m.days<days))return 'INSUFFICIENT_EVIDENCE';
  if(days<14||before.clicks<10||controlBefore.clicks<10)return 'OBSERVING';
  const ratio=(after.ctr+.0001)/(before.ctr+.0001)/((controlAfter.ctr+.0001)/(controlBefore.ctr+.0001));
  // Severe control-adjusted deterioration freezes further changes; does not claim causality or blindly roll back.
  if(ratio<.5&&after.clicks/Math.max(1,before.clicks)<.6)return 'FREEZE_REVIEW';
  return days===28&&ratio>1.2?'POSITIVE_SIGNAL_NOT_CAUSAL':'OBSERVING';
}
