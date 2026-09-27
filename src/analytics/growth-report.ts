import type {QueryExecutor} from '@/database/client';

/**
 * Growth Dashboard & Weekly Scorecard — owner reporting over the existing first-party analytics.
 *
 * No second event store: every number comes from `analytics_sessions`, `analytics_events`, the
 * affiliate click ledger (`affiliate_clicks`, the commercial source of truth) and the Traffic Engine
 * attribution views (migrations 036/037). Only HUMAN traffic is counted in business KPIs, and an event
 * only counts when its session is HUMAN too — an owner or QA session can never leak a click into the
 * numbers, even from a server path that labelled the event itself.
 *
 * Nothing external is fabricated: Search Console and native social metrics have explicit provider
 * boundaries that report "not connected" until a real, authenticated integration exists, and revenue
 * is only shown from verified operator conversion events.
 */

export const ACQUISITION_BUCKETS=['google_organic','other_search','direct','tiktok','instagram','youtube','editorial_social','other_social','referral','paid','other'] as const;
export type AcquisitionBucket=typeof ACQUISITION_BUCKETS[number];
export const ORGANIC_BUCKETS:readonly AcquisitionBucket[]=['google_organic','other_search'];
export const SOCIAL_BUCKETS:readonly AcquisitionBucket[]=['tiktok','instagram','youtube','editorial_social','other_social'];
export const BUCKET_LABELS:Record<AcquisitionBucket,string>={google_organic:'Google organic',other_search:'Other search (organic)',direct:'Direct',tiktok:'TikTok',
  instagram:'Instagram',youtube:'YouTube',editorial_social:'Editorial social',other_social:'Other social',referral:'Referral',paid:'Paid',other:'Other / unknown'};

/** Session acquisition bucket from the first-touch attribution frozen at session start. Paid wins over platform. */
export const BUCKET_SQL=`CASE
  WHEN s.referrer_class='paid' THEN 'paid'
  WHEN s.utm_source='tiktok' OR s.referrer_host ~ '(^|\\.)tiktok\\.com$' THEN 'tiktok'
  WHEN s.utm_source='instagram' OR s.referrer_host ~ '(^|\\.)instagram\\.com$' THEN 'instagram'
  WHEN s.utm_source='youtube' OR s.referrer_host ~ '(^|\\.)(youtube\\.com|youtu\\.be)$' THEN 'youtube'
  WHEN s.utm_source='editorial_social' THEN 'editorial_social'
  WHEN s.referrer_class='social' THEN 'other_social'
  WHEN s.referrer_class='google_organic' THEN 'google_organic'
  WHEN s.referrer_class IN ('bing_organic','other_search') THEN 'other_search'
  WHEN s.referrer_class='direct' THEN 'direct'
  WHEN s.referrer_class='referral' THEN 'referral'
  ELSE 'other' END`;

export interface GrowthFilters {
  from:Date;to:Date;
  locale?:'br'|'mx'|'en';geo?:'BR'|'MX';source?:AcquisitionBucket;
  competition?:string;team?:string;pageType?:string;
}
export interface PeriodMetrics {
  sessions:number;organicSessions:number;socialSessions:number;matchViews:number;oddsInteractions:number;slipAdds:number;slipsCreated:number;slipsOpened:number;
  comparisonSessions:number;ctaClicks:number;outboundRedirects:number;clickSessions:number;
  /** Sessions with at least one server-confirmed outbound redirect, as a share of sessions (%). */
  bookmakerCtr:number;
}
export interface MetricDelta {key:keyof PeriodMetrics;current:number;previous:number;change:number;changePct:number|null;}
export interface FunnelStep {key:string;label:string;sessions:number;fromPrevious:number|null;fromStart:number;}
export interface RankedEntity {key:string;label:string;sessions:number;matchViews:number;slipAdds:number;clicks:number;ctr:number;extra?:Record<string,string|number|null>;}
export interface TrafficEngineRow {
  fixturePublicId:string;fixture:string;teams:string;competition:string;channel:string;utmSource:string;status:string;publishedAt:string|null;createdAt:string;
  storyAngle:string|null;creativeFamily:string|null;scenery:string|null;characterMode:string|null;hookFamily:string|null;ctaFamily:string|null;
  sessions:number;matchViews:number;slipAdds:number;clicks:number;
}
export interface ExternalSource {id:string;label:string;connected:boolean;status:string;metrics:readonly string[];}
export interface GrowthReport {
  filters:{from:string;to:string;previousFrom:string;previousTo:string;locale?:string;geo?:string;source?:string;competition?:string;team?:string;pageType?:string};
  generatedAt:string;
  current:PeriodMetrics;previous:PeriodMetrics;deltas:MetricDelta[];
  trend:Array<{day:string;sessions:number;clicks:number;previousSessions:number;previousClicks:number}>;
  funnel:FunnelStep[];funnelByBucket:Array<{bucket:AcquisitionBucket;label:string;steps:number[]}>;
  acquisition:Array<{bucket:AcquisitionBucket;label:string;sessions:number;previousSessions:number;engaged:number;slipAdds:number;clicks:number;ctr:number}>;
  top:{landingPages:RankedEntity[];matches:RankedEntity[];competitions:RankedEntity[];teams:RankedEntity[];platforms:RankedEntity[];storyAngles:RankedEntity[];creativeFamilies:RankedEntity[];templates:RankedEntity[]};
  winners:Array<{label:'traffic winner'|'engagement winner'|'bookmaker-click winner';dimension:string;key:string;value:number}>;
  trafficEngine:TrafficEngineRow[];
  seo:{organicSessions:number;previousOrganicSessions:number;topPages:RankedEntity[];topCompetitions:RankedEntity[];funnel:FunnelStep[];searchConsole:ExternalSource};
  social:{native:readonly ExternalSource[];utm:Array<{bucket:AcquisitionBucket;label:string;sessions:number;slipAdds:number;clicks:number;ctr:number}>};
  revenue:{verified:boolean;events:number;revenue:number|null;commission:number|null;currency:string|null};
  quality:{sessionsByClass:Array<{trafficClass:string;sessions:number}>;eventsByClass:Array<{trafficClass:string;events:number}>;
    excludedOutboundBySession:number;outboundWithoutSession:number;
    reconciliation:{ledgerHumanClicks:number;analyticsHumanRedirects:number;matched:number;ledgerOnly:number;analyticsOnly:number;status:'RECONCILED'|'DRIFT'};
    flags:string[]};
}

const n=(value:unknown)=>Number(value??0);
const pct=(part:number,whole:number)=>whole?Math.round(part/whole*1000)/10:0;
export const DAY=86_400_000;

/** Previous equivalent period: the same length, immediately before. */
export function previousPeriod(from:Date,to:Date){const length=to.getTime()-from.getTime();return {from:new Date(from.getTime()-length),to:new Date(from.getTime())};}

export function delta(key:keyof PeriodMetrics,current:PeriodMetrics,previous:PeriodMetrics):MetricDelta{
  const c=current[key],p=previous[key];
  // Percentage change is only meaningful against a non-zero base; a CTR's change is reported in points.
  return {key,current:c,previous:p,change:Math.round((c-p)*10)/10,changePct:p?Math.round((c-p)/p*1000)/10:null};
}

/** Session universe + the HUMAN events of those sessions, with the owner filters applied. */
function scope(filters:GrowthFilters,params:unknown[],range:{from:Date;to:Date}){
  params.push(range.from.toISOString(),range.to.toISOString());
  const from=`$${params.length-1}`,to=`$${params.length}`;
  const where=[`s.started_at>=${from}`,`s.started_at<${to}`,`s.traffic_class='HUMAN'`];
  if(filters.locale){params.push(filters.locale);where.push(`s.locale=$${params.length}`);}
  if(filters.geo){params.push(filters.geo);where.push(`s.geo=$${params.length}`);}
  if(filters.pageType){params.push(filters.pageType);where.push(`s.landing_page_type=$${params.length}`);}
  if(filters.competition){params.push(filters.competition);where.push(`EXISTS(SELECT 1 FROM analytics_events x JOIN competitions c ON c.id=x.competition_id WHERE x.session_id=s.session_id AND c.slug=$${params.length})`);}
  if(filters.team){params.push(filters.team);where.push(`EXISTS(SELECT 1 FROM analytics_events x JOIN teams t ON t.id=x.team_id WHERE x.session_id=s.session_id AND t.public_id=$${params.length})`);}
  const bucketFilter=filters.source?(params.push(filters.source),`WHERE bucket=$${params.length}`):'';
  // Events are bounded to the session window plus a day so the time index stays usable.
  return `sess AS (SELECT * FROM (SELECT s.*,${BUCKET_SQL} AS bucket FROM analytics_sessions s WHERE ${where.join(' AND ')}) scoped ${bucketFilter}),
    ev AS (SELECT e.* FROM analytics_events e JOIN sess ON sess.session_id=e.session_id WHERE e.traffic_class='HUMAN' AND e.occurred_at>=${from} AND e.occurred_at<${to}::timestamptz+interval '1 day'),
    sm AS (SELECT sess.session_id,sess.bucket,sess.landing_path,sess.landing_page_type,sess.engaged,sess.utm_source,sess.utm_content,sess.utm_campaign,sess.started_at,
      count(ev.id) FILTER (WHERE ev.event_name='match_viewed')::int AS match_views,
      count(ev.id) FILTER (WHERE ev.event_name='odds_selected')::int AS odds,
      count(ev.id) FILTER (WHERE ev.event_name='slip_leg_added')::int AS slip_adds,
      count(ev.id) FILTER (WHERE ev.event_name='slip_created')::int AS slips_created,
      count(ev.id) FILTER (WHERE ev.event_name='slip_opened')::int AS slips_opened,
      count(ev.id) FILTER (WHERE ev.event_name='bookmaker_comparison_viewed')::int AS comparisons,
      count(ev.id) FILTER (WHERE ev.event_name='affiliate_cta_clicked')::int AS cta_clicks,
      count(ev.id) FILTER (WHERE ev.event_name='outbound_redirect_completed')::int AS outbound
      FROM sess LEFT JOIN ev ON ev.session_id=sess.session_id GROUP BY 1,2,3,4,5,6,7,8,9)`;
}

async function periodMetrics(db:QueryExecutor,filters:GrowthFilters,range:{from:Date;to:Date}):Promise<PeriodMetrics>{
  const params:unknown[]=[];const cte=scope(filters,params,range);
  params.push([...ORGANIC_BUCKETS],[...SOCIAL_BUCKETS]);
  const row=(await db.query(`WITH ${cte} SELECT count(*)::int AS sessions,
      count(*) FILTER (WHERE bucket=ANY($${params.length-1}::text[]))::int AS organic,count(*) FILTER (WHERE bucket=ANY($${params.length}::text[]))::int AS social,
      coalesce(sum(match_views),0)::int AS match_views,coalesce(sum(odds),0)::int AS odds,coalesce(sum(slip_adds),0)::int AS slip_adds,
      coalesce(sum(slips_created),0)::int AS slips_created,coalesce(sum(slips_opened),0)::int AS slips_opened,count(*) FILTER (WHERE comparisons>0)::int AS comparison_sessions,
      coalesce(sum(cta_clicks),0)::int AS cta_clicks,coalesce(sum(outbound),0)::int AS outbound,count(*) FILTER (WHERE outbound>0)::int AS click_sessions FROM sm`,params)).rows[0]??{};
  const sessions=n(row.sessions),clickSessions=n(row.click_sessions);
  return {sessions,organicSessions:n(row.organic),socialSessions:n(row.social),matchViews:n(row.match_views),oddsInteractions:n(row.odds),slipAdds:n(row.slip_adds),
    slipsCreated:n(row.slips_created),slipsOpened:n(row.slips_opened),comparisonSessions:n(row.comparison_sessions),ctaClicks:n(row.cta_clicks),
    outboundRedirects:n(row.outbound),clickSessions,bookmakerCtr:pct(clickSessions,sessions)};
}

export const FUNNEL_STEPS=[
  {key:'session',label:'Landing / session'},{key:'match',label:'Match view'},{key:'odds',label:'Odds interaction'},
  {key:'slip',label:'Slip add'},{key:'comparison',label:'Bookmaker comparison'},{key:'outbound',label:'Bookmaker outbound click'},
] as const;
/** Strict funnel: a session reaches a step only if it also reached every earlier step (in any order within the session). */
const FUNNEL_SQL=`count(*)::int AS s0,
  count(*) FILTER (WHERE match_views>0)::int AS s1,
  count(*) FILTER (WHERE match_views>0 AND odds>0)::int AS s2,
  count(*) FILTER (WHERE match_views>0 AND odds>0 AND (slip_adds>0 OR slips_created>0))::int AS s3,
  count(*) FILTER (WHERE match_views>0 AND odds>0 AND (slip_adds>0 OR slips_created>0) AND comparisons>0)::int AS s4,
  count(*) FILTER (WHERE match_views>0 AND odds>0 AND (slip_adds>0 OR slips_created>0) AND comparisons>0 AND outbound>0)::int AS s5`;
export function funnelSteps(counts:readonly number[]):FunnelStep[]{
  return FUNNEL_STEPS.map((step,index)=>({key:step.key,label:step.label,sessions:counts[index]??0,
    fromPrevious:index?pct(counts[index]??0,counts[index-1]??0):null,fromStart:pct(counts[index]??0,counts[0]??0)}));
}
const ranked=(rows:Record<string,unknown>[],extra?:(row:Record<string,unknown>)=>Record<string,string|number|null>):RankedEntity[]=>rows.map(row=>({key:String(row.key??''),label:String(row.label??row.key??''),
  sessions:n(row.sessions),matchViews:n(row.match_views),slipAdds:n(row.slip_adds),clicks:n(row.clicks),ctr:pct(n(row.click_sessions),n(row.sessions)),...(extra?{extra:extra(row)}:{})}));

/** Traffic Engine attribution: the growth item a social session landed from (latest revision before the visit). */
const ATTRIBUTION_SQL=`LEFT JOIN LATERAL (SELECT d.content_item_id,d.channel,d.story_angle,d.creative_template FROM growth_content_attribution_dimensions d
    WHERE d.utm_campaign=sm.utm_campaign AND d.utm_source=sm.utm_source AND d.utm_content=sm.utm_content AND d.created_at<=sm.started_at ORDER BY d.created_at DESC LIMIT 1) d ON true
  LEFT JOIN growth_creative_history h ON h.content_item_id=d.content_item_id AND h.channel=d.channel`;

export interface SearchConsoleProvider {status():ExternalSource;}
/**
 * Search Console boundary. No authenticated Search Console integration exists in this deployment,
 * so impressions, clicks, CTR, position and indexed pages are reported as not connected — never
 * estimated from internal traffic.
 */
export const searchConsole:SearchConsoleProvider={status:()=>({id:'google-search-console',label:'Google Search Console',connected:false,
  status:'Search Console not connected',metrics:['impressions','clicks','CTR','average position','indexed pages']})};
/** Native platform metrics boundary. Publishing is manual; no platform API is connected, so none are shown. */
export const socialNativeSources:readonly ExternalSource[]=(['TikTok','Instagram Reels','YouTube Shorts'] as const).map(label=>({id:label.toLowerCase().replace(/\s+/g,'-'),label,connected:false,
  status:'Not connected — manual publishing; native metrics unavailable',metrics:['views','watch time','likes','saves','shares']}));

export async function readGrowthReport(db:QueryExecutor,filters:GrowthFilters,now=new Date()):Promise<GrowthReport>{
  const prev=previousPeriod(filters.from,filters.to),cur={from:filters.from,to:filters.to};
  const build=(range:{from:Date;to:Date})=>{const params:unknown[]=[];return {params,cte:scope(filters,params,range)};};
  const q=(range:{from:Date;to:Date},select:(p:unknown[])=>string)=>{const {params,cte}=build(range);const sql=select(params);return db.query(`WITH ${cte} ${sql}`,params);};
  const [current,previous]=await Promise.all([periodMetrics(db,filters,cur),periodMetrics(db,filters,prev)]);
  const [trendNow,trendPrev,funnel,funnelBuckets,acqNow,acqPrev,landing,matches,competitions,teams,platforms,angles,families,templates,engine,organicPages,organicComps,organicFunnel]=await Promise.all([
    q(cur,()=>`SELECT to_char(date_trunc('day',started_at AT TIME ZONE 'America/Sao_Paulo'),'YYYY-MM-DD') AS day,count(*)::int AS sessions,coalesce(sum(outbound),0)::int AS clicks FROM sm GROUP BY 1 ORDER BY 1`),
    q(prev,()=>`SELECT to_char(date_trunc('day',started_at AT TIME ZONE 'America/Sao_Paulo'),'YYYY-MM-DD') AS day,count(*)::int AS sessions,coalesce(sum(outbound),0)::int AS clicks FROM sm GROUP BY 1 ORDER BY 1`),
    q(cur,()=>`SELECT ${FUNNEL_SQL} FROM sm`),
    q(cur,()=>`SELECT bucket,${FUNNEL_SQL} FROM sm GROUP BY bucket`),
    q(cur,()=>`SELECT bucket,count(*)::int AS sessions,count(*) FILTER (WHERE engaged)::int AS engaged,coalesce(sum(slip_adds),0)::int AS slip_adds,coalesce(sum(outbound),0)::int AS clicks,count(*) FILTER (WHERE outbound>0)::int AS click_sessions FROM sm GROUP BY bucket`),
    q(prev,()=>`SELECT bucket,count(*)::int AS sessions FROM sm GROUP BY bucket`),
    q(cur,()=>`SELECT landing_path AS key,landing_path AS label,count(*)::int AS sessions,coalesce(sum(match_views),0)::int AS match_views,coalesce(sum(slip_adds),0)::int AS slip_adds,
      coalesce(sum(outbound),0)::int AS clicks,count(*) FILTER (WHERE outbound>0)::int AS click_sessions FROM sm GROUP BY landing_path ORDER BY sessions DESC,clicks DESC LIMIT 25`),
    // Entity tables: sessions that touched the entity; clicks are those sessions' server-confirmed outbound redirects.
    q(cur,()=>`, touched AS (SELECT DISTINCT ev.session_id,f.public_id AS key,h.name||' vs '||a.name AS label FROM ev JOIN fixtures f ON f.id=ev.fixture_id JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id)
      SELECT touched.key,touched.label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,
        (SELECT count(*) FROM ev x JOIN fixtures f ON f.id=x.fixture_id WHERE f.public_id=touched.key AND x.event_name='slip_leg_added')::int AS slip_adds,
        coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions
      FROM touched JOIN sm ON sm.session_id=touched.session_id GROUP BY touched.key,touched.label ORDER BY sessions DESC,clicks DESC LIMIT 25`),
    q(cur,()=>`, touched AS (SELECT DISTINCT ev.session_id,c.slug AS key,c.name AS label FROM ev JOIN competitions c ON c.id=ev.competition_id)
      SELECT touched.key,touched.label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,
        (SELECT count(*) FROM ev x JOIN competitions c ON c.id=x.competition_id WHERE c.slug=touched.key AND x.event_name='slip_leg_added')::int AS slip_adds,
        coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions
      FROM touched JOIN sm ON sm.session_id=touched.session_id GROUP BY touched.key,touched.label ORDER BY sessions DESC,clicks DESC LIMIT 25`),
    q(cur,()=>`, touched AS (SELECT DISTINCT x.session_id,t.public_id AS key,t.name AS label FROM (
        SELECT ev.session_id,ev.team_id AS team FROM ev WHERE ev.team_id IS NOT NULL
        UNION ALL SELECT ev.session_id,f.home_team_id FROM ev JOIN fixtures f ON f.id=ev.fixture_id
        UNION ALL SELECT ev.session_id,f.away_team_id FROM ev JOIN fixtures f ON f.id=ev.fixture_id) x JOIN teams t ON t.id=x.team)
      SELECT touched.key,touched.label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,coalesce(sum(sm.slip_adds),0)::int AS slip_adds,
        coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions
      FROM touched JOIN sm ON sm.session_id=touched.session_id GROUP BY touched.key,touched.label ORDER BY sessions DESC,clicks DESC LIMIT 25`),
    q(cur,params=>{params.push([...SOCIAL_BUCKETS]);return `SELECT bucket AS key,bucket AS label,count(*)::int AS sessions,coalesce(sum(match_views),0)::int AS match_views,coalesce(sum(slip_adds),0)::int AS slip_adds,
      coalesce(sum(outbound),0)::int AS clicks,count(*) FILTER (WHERE outbound>0)::int AS click_sessions FROM sm WHERE bucket=ANY($${params.length}::text[]) GROUP BY bucket ORDER BY sessions DESC`;}),
    q(cur,()=>`SELECT coalesce(d.story_angle,'(unattributed)') AS key,coalesce(d.story_angle,'(unattributed)') AS label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,coalesce(sum(sm.slip_adds),0)::int AS slip_adds,
      coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions FROM sm ${ATTRIBUTION_SQL} WHERE sm.utm_campaign='traffic_engine_v1' GROUP BY 1,2 ORDER BY sessions DESC`),
    q(cur,()=>`SELECT coalesce(h.creative->>'family','(unattributed)') AS key,coalesce(h.creative->>'family','(unattributed)') AS label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,coalesce(sum(sm.slip_adds),0)::int AS slip_adds,
      coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions FROM sm ${ATTRIBUTION_SQL} WHERE sm.utm_campaign='traffic_engine_v1' GROUP BY 1,2 ORDER BY sessions DESC`),
    q(cur,()=>`SELECT coalesce(d.creative_template,'(unattributed)') AS key,coalesce(d.creative_template,'(unattributed)') AS label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,coalesce(sum(sm.slip_adds),0)::int AS slip_adds,
      coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions FROM sm ${ATTRIBUTION_SQL} WHERE sm.utm_campaign='traffic_engine_v1' GROUP BY 1,2 ORDER BY sessions DESC`),
    // Traffic Engine performance: every current growth item × channel made in or before the period, with the sessions it brought.
    q(cur,params=>{params.push(new Date(filters.from.getTime()-14*DAY).toISOString());return `, attributed AS (SELECT utm_source,utm_content,count(*)::int AS sessions,coalesce(sum(match_views),0)::int AS match_views,
        coalesce(sum(slip_adds),0)::int AS slip_adds,coalesce(sum(outbound),0)::int AS clicks FROM sm WHERE utm_campaign='traffic_engine_v1' GROUP BY 1,2)
      SELECT d.fixture_public_id,d.home_name||' vs '||d.away_name AS fixture,d.competition_slug,d.channel,d.utm_source,ch.status,ch.published_at,d.created_at,d.story_angle,
        h.creative->>'family' AS family,h.creative->'scenery'->>0 AS scenery,coalesce(h.render_metadata->>'characterMode',h.creative->>'characters') AS characters,h.hook_family,h.cta_family,
        coalesce(sum(a.sessions),0)::int AS sessions,coalesce(sum(a.match_views),0)::int AS match_views,coalesce(sum(a.slip_adds),0)::int AS slip_adds,coalesce(sum(a.clicks),0)::int AS clicks
      FROM growth_content_attribution_dimensions d JOIN growth_content_channels ch ON ch.content_item_id=d.content_item_id AND ch.channel=d.channel
      LEFT JOIN growth_creative_history h ON h.content_item_id=d.content_item_id AND h.channel=d.channel
      LEFT JOIN attributed a ON a.utm_source=d.utm_source AND a.utm_content=d.utm_content
      WHERE d.superseded_at IS NULL AND d.created_at>=$${params.length} AND d.created_at<$2
      GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14
      ORDER BY coalesce(sum(a.sessions),0) DESC,coalesce(sum(a.clicks),0) DESC,d.created_at DESC LIMIT 200`;}),
    q(cur,params=>{params.push([...ORGANIC_BUCKETS]);return `SELECT landing_path AS key,landing_path AS label,count(*)::int AS sessions,coalesce(sum(match_views),0)::int AS match_views,coalesce(sum(slip_adds),0)::int AS slip_adds,
      coalesce(sum(outbound),0)::int AS clicks,count(*) FILTER (WHERE outbound>0)::int AS click_sessions FROM sm WHERE bucket=ANY($${params.length}::text[]) GROUP BY 1,2 ORDER BY sessions DESC LIMIT 15`;}),
    q(cur,params=>{params.push([...ORGANIC_BUCKETS]);return `, touched AS (SELECT DISTINCT ev.session_id,c.slug AS key,c.name AS label FROM ev JOIN competitions c ON c.id=ev.competition_id)
      SELECT touched.key,touched.label,count(*)::int AS sessions,coalesce(sum(sm.match_views),0)::int AS match_views,coalesce(sum(sm.slip_adds),0)::int AS slip_adds,
        coalesce(sum(sm.outbound),0)::int AS clicks,count(*) FILTER (WHERE sm.outbound>0)::int AS click_sessions
      FROM touched JOIN sm ON sm.session_id=touched.session_id WHERE sm.bucket=ANY($${params.length}::text[]) GROUP BY 1,2 ORDER BY sessions DESC LIMIT 15`;}),
    q(cur,params=>{params.push([...ORGANIC_BUCKETS]);return `SELECT ${FUNNEL_SQL} FROM sm WHERE bucket=ANY($${params.length}::text[])`;}),
  ]);
  // Previous-period trend aligned by day offset so the two lines compare like for like.
  const days=Math.max(1,Math.ceil((filters.to.getTime()-filters.from.getTime())/DAY));
  const dayKey=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const trend=Array.from({length:Math.min(days,120)},(_,index)=>{
    const day=dayKey(new Date(filters.from.getTime()+index*DAY)),previousDay=dayKey(new Date(prev.from.getTime()+index*DAY));
    const nowRow=trendNow.rows.find(row=>row.day===day),prevRow=trendPrev.rows.find(row=>row.day===previousDay);
    return {day,sessions:n(nowRow?.sessions),clicks:n(nowRow?.clicks),previousSessions:n(prevRow?.sessions),previousClicks:n(prevRow?.clicks)};
  });
  const counts=(row:Record<string,unknown>|undefined)=>[0,1,2,3,4,5].map(index=>n(row?.[`s${index}`]));
  const labelOf=(bucket:string)=>BUCKET_LABELS[bucket as AcquisitionBucket]??bucket;
  const top={
    landingPages:ranked(landing.rows),matches:ranked(matches.rows),competitions:ranked(competitions.rows),teams:ranked(teams.rows),
    platforms:ranked(platforms.rows).map(row=>({...row,label:labelOf(row.key)})),storyAngles:ranked(angles.rows),creativeFamilies:ranked(families.rows),templates:ranked(templates.rows),
  };
  const [quality,revenue]=await Promise.all([readQuality(db,cur),readRevenue(db,cur)]);
  return {
    filters:{from:filters.from.toISOString(),to:filters.to.toISOString(),previousFrom:prev.from.toISOString(),previousTo:prev.to.toISOString(),
      ...(filters.locale?{locale:filters.locale}:{}),...(filters.geo?{geo:filters.geo}:{}),...(filters.source?{source:filters.source}:{}),
      ...(filters.competition?{competition:filters.competition}:{}),...(filters.team?{team:filters.team}:{}),...(filters.pageType?{pageType:filters.pageType}:{})},
    generatedAt:now.toISOString(),current,previous,
    deltas:(['sessions','organicSessions','socialSessions','matchViews','oddsInteractions','slipAdds','slipsCreated','slipsOpened','comparisonSessions','ctaClicks','outboundRedirects','bookmakerCtr'] as const).map(key=>delta(key,current,previous)),
    trend,funnel:funnelSteps(counts(funnel.rows[0])),
    funnelByBucket:funnelBuckets.rows.map(row=>({bucket:String(row.bucket) as AcquisitionBucket,label:labelOf(String(row.bucket)),steps:counts(row)})).sort((a,b)=>b.steps[0]!-a.steps[0]!),
    acquisition:ACQUISITION_BUCKETS.map(bucket=>{const row=acqNow.rows.find(item=>item.bucket===bucket),before=acqPrev.rows.find(item=>item.bucket===bucket);
      return {bucket,label:BUCKET_LABELS[bucket],sessions:n(row?.sessions),previousSessions:n(before?.sessions),engaged:n(row?.engaged),slipAdds:n(row?.slip_adds),clicks:n(row?.clicks),ctr:pct(n(row?.click_sessions),n(row?.sessions))};})
      .filter(row=>row.sessions||row.previousSessions),
    top,winners:pickWinners(top),
    trafficEngine:engine.rows.map(row=>({fixturePublicId:String(row.fixture_public_id),fixture:String(row.fixture),teams:String(row.fixture),competition:String(row.competition_slug),
      channel:String(row.channel),utmSource:String(row.utm_source),status:String(row.status),publishedAt:row.published_at?new Date(String(row.published_at)).toISOString():null,
      createdAt:new Date(String(row.created_at)).toISOString(),storyAngle:row.story_angle?String(row.story_angle):null,creativeFamily:row.family?String(row.family):null,
      scenery:row.scenery?String(row.scenery):null,characterMode:row.characters?String(row.characters):null,hookFamily:row.hook_family?String(row.hook_family):null,ctaFamily:row.cta_family?String(row.cta_family):null,
      sessions:n(row.sessions),matchViews:n(row.match_views),slipAdds:n(row.slip_adds),clicks:n(row.clicks)})),
    seo:{organicSessions:current.organicSessions,previousOrganicSessions:previous.organicSessions,topPages:ranked(organicPages.rows),topCompetitions:ranked(organicComps.rows),
      funnel:funnelSteps(counts(organicFunnel.rows[0])),searchConsole:searchConsole.status()},
    social:{native:socialNativeSources,utm:SOCIAL_BUCKETS.map(bucket=>{const row=acqNow.rows.find(item=>item.bucket===bucket);
      return {bucket,label:BUCKET_LABELS[bucket],sessions:n(row?.sessions),slipAdds:n(row?.slip_adds),clicks:n(row?.clicks),ctr:pct(n(row?.click_sessions),n(row?.sessions))};})},
    revenue,quality,
  };
}

/** Transparent labels: the single highest value per dimension, and only with at least some signal. */
export function pickWinners(top:GrowthReport['top']):GrowthReport['winners']{
  const winners:GrowthReport['winners']=[];
  const dimensions:Array<[string,RankedEntity[]]>=[['Landing page',top.landingPages],['Match',top.matches],['Competition',top.competitions],['Club',top.teams],['Social platform',top.platforms],['Story angle',top.storyAngles],['Creative family',top.creativeFamilies]];
  for(const [dimension,rows] of dimensions){
    const best=(value:(row:RankedEntity)=>number)=>rows.filter(row=>value(row)>0).sort((a,b)=>value(b)-value(a)||b.sessions-a.sessions)[0];
    const traffic=best(row=>row.sessions),engagement=best(row=>row.slipAdds),clicks=best(row=>row.clicks);
    if(traffic)winners.push({label:'traffic winner',dimension,key:traffic.label,value:traffic.sessions});
    if(engagement)winners.push({label:'engagement winner',dimension,key:engagement.label,value:engagement.slipAdds});
    if(clicks)winners.push({label:'bookmaker-click winner',dimension,key:clicks.label,value:clicks.clicks});
  }
  return winners;
}

async function readQuality(db:QueryExecutor,range:{from:Date;to:Date}):Promise<GrowthReport['quality']>{
  const params=[range.from.toISOString(),range.to.toISOString()];
  const [sessions,events,outbound,ledger,ingestion]=await Promise.all([
    db.query(`SELECT traffic_class,count(*)::int AS sessions FROM analytics_sessions WHERE started_at>=$1 AND started_at<$2 GROUP BY 1 ORDER BY 2 DESC`,params),
    db.query(`SELECT traffic_class,count(*)::int AS events FROM analytics_events WHERE occurred_at>=$1 AND occurred_at<$2 GROUP BY 1 ORDER BY 2 DESC`,params),
    db.query(`SELECT count(*) FILTER (WHERE s.session_id IS NOT NULL AND s.traffic_class<>'HUMAN')::int AS excluded,count(*) FILTER (WHERE s.session_id IS NULL)::int AS sessionless,
        count(*) FILTER (WHERE coalesce(s.traffic_class,'HUMAN')='HUMAN')::int AS human
      FROM analytics_events e LEFT JOIN analytics_sessions s ON s.session_id=e.session_id
      WHERE e.event_name='outbound_redirect_completed' AND e.traffic_class='HUMAN' AND e.occurred_at>=$1 AND e.occurred_at<$2`,params),
    // The redirect writes the click ledger and the analytics event with one shared UUID, so matching is exact.
    db.query(`SELECT count(*)::int AS ledger,count(e.event_id)::int AS matched FROM affiliate_clicks c
      LEFT JOIN analytics_events e ON e.event_id=c.id AND e.event_name='outbound_redirect_completed'
      WHERE c.traffic_class='HUMAN_CLICK' AND c.clicked_at>=$1 AND c.clicked_at<$2`,params).catch(()=>({rows:[{ledger:0,matched:0}]})),
    db.query(`SELECT coalesce(sum(accepted),0)::int AS accepted,coalesce(sum(duplicates),0)::int AS duplicates,coalesce(sum(rejected),0)::int AS rejected,coalesce(max(max_lag_seconds),0)::int AS lag
      FROM analytics_ingestion_quality WHERE bucket>=$1 AND bucket<$2`,params),
  ]);
  const o=outbound.rows[0]??{},l=ledger.rows[0]??{},q=ingestion.rows[0]??{};
  // Analytics may carry HUMAN redirect events whose ledger row was QA/owner — they are the "analytics only" side.
  const analyticsHuman=n(o.human)+n(o.excluded),matched=n(l.matched),ledgerHuman=n(l.ledger);
  const flags:string[]=[];
  if(n(o.excluded)>0)flags.push('OWNER_OR_QA_REDIRECTS_EXCLUDED_BY_SESSION');
  if(n(q.accepted)+n(q.duplicates)>0&&n(q.duplicates)/(n(q.accepted)+n(q.duplicates))>.2)flags.push('HIGH_DUPLICATE_RATE');
  if(n(q.accepted)+n(q.rejected)>0&&n(q.rejected)/(n(q.accepted)+n(q.rejected))>.1)flags.push('HIGH_REJECTION_RATE');
  if(n(q.lag)>900)flags.push('EVENT_LAG_OVER_15_MIN');
  const drift=ledgerHuman-matched!==0||analyticsHuman-matched!==0;
  if(drift)flags.push('CLICK_LEDGER_ANALYTICS_DRIFT');
  return {sessionsByClass:sessions.rows.map(row=>({trafficClass:String(row.traffic_class),sessions:n(row.sessions)})),
    eventsByClass:events.rows.map(row=>({trafficClass:String(row.traffic_class),events:n(row.events)})),
    excludedOutboundBySession:n(o.excluded),outboundWithoutSession:n(o.sessionless),
    reconciliation:{ledgerHumanClicks:ledgerHuman,analyticsHumanRedirects:analyticsHuman,matched,ledgerOnly:ledgerHuman-matched,analyticsOnly:analyticsHuman-matched,status:drift?'DRIFT':'RECONCILED'},flags};
}

/** Revenue only from verified operator conversion events. Absent evidence is reported as absent. */
async function readRevenue(db:QueryExecutor,range:{from:Date;to:Date}):Promise<GrowthReport['revenue']>{
  try{
    const row=(await db.query(`SELECT count(*)::int AS events,sum(reported_revenue) AS revenue,sum(reported_commission) AS commission,
        CASE WHEN count(DISTINCT currency)=1 THEN max(currency) END AS currency FROM affiliate_conversion_events WHERE occurred_at>=$1 AND occurred_at<$2`,[range.from.toISOString(),range.to.toISOString()])).rows[0]??{};
    const events=n(row.events);
    return {verified:events>0,events,revenue:row.revenue===null||row.revenue===undefined?null:Number(row.revenue),commission:row.commission===null||row.commission===undefined?null:Number(row.commission),currency:row.currency?String(row.currency):null};
  }catch{return {verified:false,events:0,revenue:null,commission:null,currency:null};}
}

// ---------------------------------------------------------------------------------------------
// Weekly scorecard
// ---------------------------------------------------------------------------------------------
/** Thresholds behind every label — shown on the page, so no label is a black box. */
export const SCORECARD_RULES={
  /** Minimum sessions before a row can be called a winner or a weak signal. */
  minSessions:20,
  /** A winner converts to bookmaker clicks at ≥ this multiple of the site-wide session CTR… */
  winnerCtrMultiple:1.25,
  /** …or leads its table on bookmaker clicks with at least this many. */
  winnerMinClicks:3,
  /** Watchlist: growing fast from a small base, or converting well on low volume. */
  watchGrowthPct:50,watchMinSessions:5,
  /** Weak: real volume with no clicks, or volume down by at least this much week on week. */
  weakDropPct:-50,
} as const;
export type ScoreLabel='WINNER'|'WATCHLIST'|'WEAK';
export interface ScoredRow {dimension:string;key:string;label:string;sessions:number;previousSessions:number;clicks:number;ctr:number;verdict:ScoreLabel;reason:string;}
export function scoreRows(dimension:string,rows:readonly RankedEntity[],previous:readonly RankedEntity[],siteCtr:number):ScoredRow[]{
  const r=SCORECARD_RULES,out:ScoredRow[]=[],maxClicks=Math.max(0,...rows.map(row=>row.clicks));
  for(const row of rows){
    const before=previous.find(item=>item.key===row.key)?.sessions??0,growth=before?(row.sessions-before)/before*100:null;
    const base={dimension,key:row.key,label:row.label,sessions:row.sessions,previousSessions:before,clicks:row.clicks,ctr:row.ctr};
    if(row.sessions>=r.minSessions&&siteCtr>0&&row.ctr>=siteCtr*r.winnerCtrMultiple&&row.clicks>0)out.push({...base,verdict:'WINNER',reason:`CTR ${row.ctr}% ≥ ${r.winnerCtrMultiple}× site ${siteCtr}% on ${row.sessions} sessions`});
    else if(row.clicks>=r.winnerMinClicks&&row.clicks===maxClicks)out.push({...base,verdict:'WINNER',reason:`Most bookmaker clicks (${row.clicks})`});
    else if(row.sessions>=r.minSessions&&row.clicks===0)out.push({...base,verdict:'WEAK',reason:`${row.sessions} sessions, no bookmaker clicks`});
    else if(growth!==null&&before>=r.minSessions&&growth<=r.weakDropPct)out.push({...base,verdict:'WEAK',reason:`Sessions ${Math.round(growth)}% week on week`});
    else if(row.sessions>=r.watchMinSessions&&growth!==null&&growth>=r.watchGrowthPct)out.push({...base,verdict:'WATCHLIST',reason:`Sessions +${Math.round(growth)}% week on week`});
    else if(row.sessions>=r.watchMinSessions&&row.sessions<r.minSessions&&siteCtr>0&&row.ctr>=siteCtr*r.winnerCtrMultiple)out.push({...base,verdict:'WATCHLIST',reason:`High CTR ${row.ctr}% on low volume (${row.sessions})`});
    else if(row.sessions>=r.watchMinSessions&&before===0)out.push({...base,verdict:'WATCHLIST',reason:'New this week'});
  }
  return out;
}

/** Monday 00:00 in São Paulo (UTC−03:00, no DST since 2019) for the week containing `date`. */
export function weekStart(date:Date):Date{
  const local=new Date(date.getTime()-3*3600_000),weekday=(local.getUTCDay()+6)%7;
  return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-weekday,3,0,0));
}
export interface WeeklyScorecard {
  week:{from:string;to:string;label:string};previousWeek:{from:string;to:string};complete:boolean;
  metrics:MetricDelta[];
  top:{landingPages:RankedEntity[];matches:RankedEntity[];competitions:RankedEntity[];clubs:RankedEntity[];socialSource:RankedEntity|null;storyAngle:RankedEntity|null;creativeFamily:RankedEntity|null};
  scored:{winners:ScoredRow[];watchlist:ScoredRow[];weak:ScoredRow[]};rules:typeof SCORECARD_RULES;
  report:GrowthReport;
}
export async function readWeeklyScorecard(db:QueryExecutor,weekOf:Date,filters:Omit<GrowthFilters,'from'|'to'>={},now=new Date()):Promise<WeeklyScorecard>{
  const from=weekStart(weekOf),to=new Date(from.getTime()+7*DAY),prevFrom=new Date(from.getTime()-7*DAY);
  const [report,previousReport]=await Promise.all([readGrowthReport(db,{...filters,from,to},now),readGrowthReport(db,{...filters,from:prevFrom,to:from},now)]);
  const keys=['sessions','organicSessions','socialSessions','matchViews','slipAdds','outboundRedirects','bookmakerCtr'] as const;
  const siteCtr=report.current.bookmakerCtr;
  const scored=[
    ...scoreRows('Landing page',report.top.landingPages,previousReport.top.landingPages,siteCtr),...scoreRows('Match',report.top.matches,previousReport.top.matches,siteCtr),
    ...scoreRows('Competition',report.top.competitions,previousReport.top.competitions,siteCtr),...scoreRows('Club',report.top.teams,previousReport.top.teams,siteCtr),
    ...scoreRows('Social source',report.top.platforms,previousReport.top.platforms,siteCtr),...scoreRows('Story angle',report.top.storyAngles,previousReport.top.storyAngles,siteCtr),
    ...scoreRows('Creative family',report.top.creativeFamilies,previousReport.top.creativeFamilies,siteCtr),
  ];
  const label=`${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(from)} – ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(to.getTime()-1))}`;
  return {week:{from:from.toISOString(),to:to.toISOString(),label},previousWeek:{from:prevFrom.toISOString(),to:from.toISOString()},complete:now>=to,
    metrics:keys.map(key=>delta(key,report.current,report.previous)),
    top:{landingPages:report.top.landingPages.slice(0,5),matches:report.top.matches.slice(0,5),competitions:report.top.competitions.slice(0,5),clubs:report.top.teams.slice(0,5),
      socialSource:report.top.platforms[0]??null,storyAngle:report.top.storyAngles.find(row=>row.key!=='(unattributed)')??null,creativeFamily:report.top.creativeFamilies.find(row=>row.key!=='(unattributed)')??null},
    scored:{winners:scored.filter(row=>row.verdict==='WINNER'),watchlist:scored.filter(row=>row.verdict==='WATCHLIST'),weak:scored.filter(row=>row.verdict==='WEAK')},
    rules:SCORECARD_RULES,report};
}
