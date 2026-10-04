import {createHash} from 'node:crypto';
import {scoreFixture,type FixtureSignals,type FixturePriority} from '@/growth/scoring';
import {type Geo} from '@/config/geo';
import type {InterfaceLocale} from '@/localization/interface';
import {matchPath,teamPath} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import {siteOrigin} from '@/seo/policy';
import {SEO_AUTOPILOT as config} from './config';

export interface OpportunityEvidence {
  geo?:Geo;priority?:FixturePriority;brazil?:boolean;impressions:number;clicks:number;queryImpressions:number;relatedImpressions:number;
  uniqueSignals:string[];fresh:boolean;shortlisted:boolean;inboundSources:number;clusterBoost:number;
}
export function seoOpportunityScore(f:FixtureSignals,e:OpportunityEvidence,now:Date){
  // The acquisition score is shared with Growth and product discovery. SEO evidence is a
  // publication/readiness gate, never a second editorial ranking or a Brazilian bonus.
  const priority=e.priority??scoreFixture(f,now,{geo:e.geo??'ROW',searchStrength:Math.min(1,Math.log2(1+Math.max(0,e.impressions+e.relatedImpressions))/14)});
  const total=priority.total;
  return {total,tier:total>=config.tierAThreshold?'A':total>=config.tierBThreshold?'B':'C',
    components:priority.lines.map(l=>({name:l.component,points:l.points,reason:l.reason})),reasons:priority.reasons};
}

export type PublishState='PUBLISHED'|'BLOCKED'|'PRODUCT_ONLY'|'NOINDEX'|'RETRYABLE_DATA_GAP';
export interface PublishEvidence {
  score:number;uniqueSignals:number;fresh:boolean;quality:boolean;duplicateRisk:'LOW'|'HIGH';
  canonicalValid:boolean;urlValid:boolean;httpStatus:number;indexFollow:boolean;internalLinkSources:number;
  sitemapEligible:boolean;structuredDataValid:boolean;localeValid:boolean;factual:boolean;
  placeholders:boolean;emptyModules:boolean;serverRendered:boolean;englishLeak:boolean;
}
export function seoPublishGate(e:PublishEvidence):{state:PublishState;reasons:string[]}{
  if(!config.enabled||!config.autoPublish)return {state:'BLOCKED',reasons:['AUTOPUBLISH_DISABLED']};
  const hard:string[]=[];
  if(!e.urlValid||!e.canonicalValid)hard.push('INVALID_CANONICAL');
  if(e.duplicateRisk!=='LOW')hard.push('DUPLICATE_INTENT');
  if(!e.factual||e.placeholders||e.englishLeak||!e.localeValid)hard.push('CONTENT_UNSAFE');
  if(!e.structuredDataValid)hard.push('STRUCTURED_DATA_INVALID');
  if(hard.length)return {state:'BLOCKED',reasons:hard};
  if(!Number.isFinite(e.score)||e.score<config.tierBThreshold)return {state:'PRODUCT_ONLY',reasons:['BELOW_OPPORTUNITY_THRESHOLD']};
  if(!e.indexFollow)return {state:'NOINDEX',reasons:['EXISTING_NOINDEX_PRESERVED']};
  const gaps:string[]=[];
  if(!e.fresh)gaps.push('STALE_SOURCE');
  if(e.uniqueSignals<config.minUniqueSignals||!e.quality||e.emptyModules)gaps.push('INSUFFICIENT_UNIQUE_DATA');
  if(e.httpStatus!==200||!e.serverRendered)gaps.push('RENDER_NOT_VERIFIED');
  if(e.internalLinkSources<config.minInternalLinks)gaps.push('INSUFFICIENT_INBOUND_LINKS');
  if(!e.sitemapEligible)gaps.push('NOT_SITEMAP_ELIGIBLE');
  return gaps.length?{state:'RETRYABLE_DATA_GAP',reasons:gaps}:{state:'PUBLISHED',reasons:['SCORE_DATA_HTML_LINKS_PASS']};
}
export interface SeoLink {href:string;label:string;relation:'TEAM'|'COMPETITION'|'FIXTURE'|'H2H';priority:number;}
export function seoInternalLinkEngine(f:FixtureSignals,related:Array<{signals:FixtureSignals;score:number}>=[],locale:InterfaceLocale='en'):SeoLink[]{
  const links:SeoLink[]=[{href:teamPath(locale,f.home.publicId,f.home.name),label:locale==='br'?`Jogos e resultados do ${f.home.name}`:locale==='en'?`${f.home.name} fixtures and results`:`Partidos y resultados de ${f.home.name}`,relation:'TEAM',priority:100},
    {href:teamPath(locale,f.away.publicId,f.away.name),label:locale==='br'?`Jogos e resultados do ${f.away.name}`:locale==='en'?`${f.away.name} fixtures and results`:`Partidos y resultados de ${f.away.name}`,relation:'TEAM',priority:100},
    {href:competitionPath(locale,f.competitionSlug),label:locale==='br'?`Jogos de ${f.competitionName}`:locale==='en'?`${f.competitionName} fixtures`:`Partidos de ${f.competitionName}`,relation:'COMPETITION',priority:100}];
  for(const r of related.filter(r=>r.signals.fixtureId!==f.fixtureId&&(r.signals.competitionSlug===f.competitionSlug||
    [r.signals.home.publicId,r.signals.away.publicId].some(id=>[f.home.publicId,f.away.publicId].includes(id))))
    .sort((a,b)=>b.score-a.score||a.signals.publicId.localeCompare(b.signals.publicId)).slice(0,3)){
    links.push({href:matchPath(locale,r.signals.publicId,r.signals.home.name,r.signals.away.name),label:`${r.signals.home.name} x ${r.signals.away.name}`,relation:'FIXTURE',priority:r.score});
  }
  return [...new Map(links.map(l=>[l.href,l])).values()];
}
/** Stable content-only identity. Never include fetched_at, checked_at, score or analytics counters. */
export function contentHash(value:unknown):string{
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function cleanCanonical(value:string){
  try{const u=new URL(value,siteOrigin);if(u.origin!==siteOrigin||!/^\/(br|mx|co|pe|en)\//.test(u.pathname))return null;
    for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))u.searchParams.delete(key);
    u.hash='';return u.href;
  }catch{return null;}
}
export interface FeedbackMetrics {impressions:number;clicks:number;position:number;days:number;}
export function feedbackDecision(current:FeedbackMetrics,previous:FeedbackMetrics,ageDays:number,strategic:boolean){
  const reliable=current.days>=config.minFeedbackDays&&previous.days>=config.minFeedbackDays;
  const actions:string[]=[];
  if(current.impressions>=30&&current.position>=8&&current.position<=20)actions.push('STRENGTHEN_EXISTING_PAGE');
  if(current.impressions>=100&&current.clicks/current.impressions<0.015)actions.push('REVIEW_FACTUAL_SNIPPET');
  let boost=0;
  if(reliable&&previous.impressions>=config.minFeedbackImpressions&&current.impressions>=previous.impressions*1.2&&current.clicks>previous.clicks){boost=config.maxClusterBoost;actions.push('WINNING_CLUSTER');}
  if(reliable&&previous.impressions>=100&&current.impressions<previous.impressions*0.8)actions.push('DIAGNOSE_DECAY');
  if(ageDays>=config.evaluationWindowDays&&current.days>=28&&current.impressions===0)actions.push(strategic?'RETAIN_STRATEGIC':'REVIEW_SITEMAP_EXCLUSION');
  return {boost,actions,reliable};
}
