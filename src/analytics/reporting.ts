import type {QueryExecutor} from '@/database/client';
import {LEG_BUCKETS,type Locale,type PageType,type ReferrerClass} from './taxonomy';

/**
 * P4 owner reporting: bounded, indexed SQL aggregates (no raw event streaming, no provider calls).
 * Only HUMAN traffic counts by default; QA/OWNER/BOT rows are visible separately for data-quality checks.
 */
export type ReportWindow='today'|'7d'|'30d';
export interface ReportFilters {window:ReportWindow;locale?:Locale;geo?:'BR'|'MX';bookmaker?:'betano.bet.br'|'betsson';competition?:string;pageType?:PageType;source?:ReferrerClass;traffic?:'HUMAN'|'QA'|'OWNER'|'BOT';}
export interface FunnelStage {stage:string;sessions:number;fromPrevious:number|null;fromSession:number;}
export interface RankedRow {key:string;label:string;views:number;slips:number;clicks:number;rate:number;sessions:number;}
export interface AnalyticsReport {
  filters:ReportFilters;from:string;to:string;generatedAt:string;
  cards:{sessions:number;newVisitors:number;returningVisitors:number;engagedSessions:number;contentViews:number;oddsSelections:number;slipsCreated:number;comparisons:number;affiliateClicks:number;outboundRedirects:number;clickThroughRate:number;signIns:number;favoritesAdded:number;pageViews:number};
  funnel:FunnelStage[];legBuckets:Array<{bucket:string;sessions:number}>;comparisonStates:Array<{state:string;sessions:number}>;
  top:{landingPages:RankedRow[];competitions:RankedRow[];teams:RankedRow[];matches:RankedRow[];placements:RankedRow[];bookmakers:RankedRow[]};
  acquisition:Array<{source:string;sessions:number;engaged:number;slips:number;clicks:number;rate:number}>;
  campaigns:Array<{campaign:string;source:string|null;medium:string|null;sessions:number;slips:number;clicks:number}>;
  locales:Array<{locale:string;sessions:number;odds:number;slips:number;clicks:number;favorites:number;signIns:number}>;
  geos:Array<{geo:string;sessions:number;odds:number;slips:number;clicks:number;favorites:number;signIns:number}>;
  retention:{returningShare:number;authenticatedReturning:number;anonymousReturning:number};
  quality:{accepted:number;duplicates:number;rejected:number;unknownEvents:number;missingSession:number;oversized:number;serverEvents:number;maxLagSeconds:number;duplicateRate:number;trafficMix:Array<{trafficClass:string;events:number}>;flags:string[];lastEventAt:string|null};
}
const CONTENT_VIEWS=['competition_viewed','match_viewed','team_viewed','player_viewed'];
const CLICKS=['affiliate_cta_clicked','outbound_redirect_completed'];
const pct=(n:number,d:number)=>d?Math.round(n/d*1000)/10:0;
const n=(v:unknown)=>Number(v??0);

export function windowBounds(window:ReportWindow,now=new Date()):{from:Date;to:Date}{
  const to=now;const from=new Date(now);
  if(window==='today')from.setUTCHours(0,0,0,0);else from.setTime(now.getTime()-(window==='7d'?7:30)*86400000);
  return {from,to};
}
export async function readAnalyticsReport(db:QueryExecutor,filters:ReportFilters,now=new Date()):Promise<AnalyticsReport>{
  const {from,to}=windowBounds(filters.window,now);
  const traffic=filters.traffic??'HUMAN';
  // Session universe under the filters (session-level dimensions); event-level dimensions narrow the funnel stages.
  const params:unknown[]=[from.toISOString(),to.toISOString(),traffic];
  const sessionWhere=['s.started_at>=$1','s.started_at<$2','s.traffic_class=$3'];
  if(filters.locale){params.push(filters.locale);sessionWhere.push(`s.locale=$${params.length}`);}
  if(filters.geo){params.push(filters.geo);sessionWhere.push(`s.geo=$${params.length}`);}
  if(filters.source){params.push(filters.source);sessionWhere.push(`s.referrer_class=$${params.length}`);}
  if(filters.pageType){params.push(filters.pageType);sessionWhere.push(`s.landing_page_type=$${params.length}`);}
  if(filters.competition){params.push(filters.competition);sessionWhere.push(`EXISTS(SELECT 1 FROM analytics_events x JOIN competitions c ON c.id=x.competition_id WHERE x.session_id=s.session_id AND c.slug=$${params.length})`);}
  if(filters.bookmaker){params.push(filters.bookmaker);sessionWhere.push(`EXISTS(SELECT 1 FROM analytics_events x WHERE x.session_id=s.session_id AND x.bookmaker=$${params.length})`);}
  const S=`SELECT s.* FROM analytics_sessions s WHERE ${sessionWhere.join(' AND ')}`;
  const E=`SELECT e.* FROM analytics_events e WHERE e.occurred_at>=$1 AND e.occurred_at<$2 AND e.traffic_class=$3 AND e.session_id IN (SELECT session_id FROM sess)`;
  const [cards,funnel,legs,states,landing,competitions,teams,matches,placements,bookmakers,acquisition,campaigns,locales,geos,retention,quality,mix,last]=await Promise.all([
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT
      (SELECT count(*) FROM sess)::int AS sessions,(SELECT count(*) FROM sess WHERE visitor_kind='NEW')::int AS new_visitors,(SELECT count(*) FROM sess WHERE visitor_kind='RETURNING')::int AS returning_visitors,
      (SELECT count(*) FROM sess WHERE engaged)::int AS engaged,
      (SELECT count(*) FROM ev WHERE event_name=ANY($${params.length+1}::text[]))::int AS content_views,(SELECT count(*) FROM ev WHERE event_name='page_viewed')::int AS page_views,
      (SELECT count(*) FROM ev WHERE event_name='odds_selected')::int AS odds_selections,(SELECT count(*) FROM ev WHERE event_name='slip_created')::int AS slips_created,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name='bookmaker_comparison_viewed')::int AS comparisons,
      (SELECT count(*) FROM ev WHERE event_name='affiliate_cta_clicked')::int AS affiliate_clicks,(SELECT count(*) FROM ev WHERE event_name='outbound_redirect_completed')::int AS outbound,
      (SELECT count(*) FROM ev WHERE event_name='sign_in_completed')::int AS sign_ins,(SELECT count(*) FROM ev WHERE event_name='favorite_added')::int AS favorites_added`,[...params,CONTENT_VIEWS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT
      (SELECT count(*) FROM sess)::int AS s0,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name=ANY($${params.length+1}::text[]))::int AS s1,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name='odds_selected')::int AS s2,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name IN ('slip_created','slip_leg_added'))::int AS s3,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name='bookmaker_comparison_viewed')::int AS s4,
      (SELECT count(DISTINCT session_id) FROM ev WHERE event_name=ANY($${params.length+2}::text[]))::int AS s5`,[...params,CONTENT_VIEWS,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT CASE WHEN m>=5 THEN '5+' ELSE m::text END AS bucket,count(*)::int AS sessions FROM (SELECT session_id,max(slip_leg_count) AS m FROM ev WHERE event_name IN ('slip_leg_added','odds_selected','slip_opened') AND slip_leg_count>0 GROUP BY session_id) t GROUP BY 1`,params),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT comparison_state AS state,count(DISTINCT session_id)::int AS sessions FROM ev WHERE event_name='bookmaker_comparison_viewed' AND comparison_state IS NOT NULL GROUP BY 1`,params),
    db.query(`WITH sess AS (${S}) SELECT s.landing_path AS key,s.landing_path AS label,count(*)::int AS sessions,count(*)::int AS views,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.landing_path=s.landing_path) AND e.event_name IN ('slip_created','slip_leg_added'))::int AS slips,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.landing_path=s.landing_path) AND e.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM sess s GROUP BY s.landing_path ORDER BY sessions DESC LIMIT 15`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT c.slug AS key,c.slug AS label,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name='competition_viewed' OR ev.event_name='match_viewed')::int AS views,count(DISTINCT ev.session_id)::int AS sessions,
        count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name IN ('slip_created','slip_leg_added','odds_selected'))::int AS slips,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM ev JOIN competitions c ON c.id=ev.competition_id GROUP BY c.slug ORDER BY views DESC LIMIT 15`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT t.public_id AS key,t.name AS label,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name='team_viewed')::int AS views,count(DISTINCT ev.session_id)::int AS sessions,
        count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name IN ('slip_created','slip_leg_added','odds_selected'))::int AS slips,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM ev JOIN teams t ON t.id=ev.team_id GROUP BY t.public_id,t.name ORDER BY views DESC LIMIT 10`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT f.public_id AS key,h.name||' v '||a.name AS label,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name='match_viewed')::int AS views,count(DISTINCT ev.session_id)::int AS sessions,
        count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name IN ('slip_created','slip_leg_added','odds_selected'))::int AS slips,count(DISTINCT ev.session_id) FILTER (WHERE ev.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM ev JOIN fixtures f ON f.id=ev.fixture_id JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id GROUP BY f.public_id,h.name,a.name ORDER BY views DESC LIMIT 10`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT coalesce(placement,'(none)') AS key,coalesce(placement,'(none)') AS label,count(*) FILTER (WHERE event_name='affiliate_cta_viewed')::int AS views,count(DISTINCT session_id)::int AS sessions,0::int AS slips,
        count(*) FILTER (WHERE event_name=ANY($${params.length+1}::text[]))::int AS clicks FROM ev WHERE event_name IN ('affiliate_cta_viewed','affiliate_cta_clicked','outbound_redirect_completed') GROUP BY placement ORDER BY clicks DESC,views DESC LIMIT 10`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT bookmaker AS key,bookmaker AS label,count(*) FILTER (WHERE event_name='affiliate_cta_viewed')::int AS views,count(DISTINCT session_id)::int AS sessions,
        count(DISTINCT session_id) FILTER (WHERE event_name='odds_selected')::int AS slips,count(*) FILTER (WHERE event_name=ANY($${params.length+1}::text[]))::int AS clicks FROM ev WHERE bookmaker IS NOT NULL GROUP BY bookmaker ORDER BY clicks DESC`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}) SELECT s.referrer_class AS source,count(*)::int AS sessions,count(*) FILTER (WHERE s.engaged)::int AS engaged,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.referrer_class=s.referrer_class) AND e.event_name IN ('slip_created','slip_leg_added'))::int AS slips,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.referrer_class=s.referrer_class) AND e.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM sess s GROUP BY s.referrer_class ORDER BY sessions DESC`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}) SELECT s.utm_campaign AS campaign,s.utm_source AS source,s.utm_medium AS medium,count(*)::int AS sessions,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.utm_campaign=s.utm_campaign) AND e.event_name IN ('slip_created','slip_leg_added'))::int AS slips,
        (SELECT count(DISTINCT e.session_id) FROM analytics_events e WHERE e.session_id IN (SELECT session_id FROM sess x WHERE x.utm_campaign=s.utm_campaign) AND e.event_name=ANY($${params.length+1}::text[]))::int AS clicks
      FROM sess s WHERE s.utm_campaign IS NOT NULL GROUP BY 1,2,3 ORDER BY sessions DESC LIMIT 15`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT s.locale,count(DISTINCT s.session_id)::int AS sessions,count(*) FILTER (WHERE ev.event_name='odds_selected')::int AS odds,count(*) FILTER (WHERE ev.event_name='slip_created')::int AS slips,
        count(*) FILTER (WHERE ev.event_name=ANY($${params.length+1}::text[]))::int AS clicks,count(*) FILTER (WHERE ev.event_name='favorite_added')::int AS favorites,count(*) FILTER (WHERE ev.event_name='sign_in_completed')::int AS sign_ins
      FROM sess s LEFT JOIN ev ON ev.session_id=s.session_id GROUP BY s.locale ORDER BY sessions DESC`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}), ev AS (${E}) SELECT coalesce(s.geo,'other') AS geo,count(DISTINCT s.session_id)::int AS sessions,count(*) FILTER (WHERE ev.event_name='odds_selected')::int AS odds,count(*) FILTER (WHERE ev.event_name='slip_created')::int AS slips,
        count(*) FILTER (WHERE ev.event_name=ANY($${params.length+1}::text[]))::int AS clicks,count(*) FILTER (WHERE ev.event_name='favorite_added')::int AS favorites,count(*) FILTER (WHERE ev.event_name='sign_in_completed')::int AS sign_ins
      FROM sess s LEFT JOIN ev ON ev.session_id=s.session_id GROUP BY 1 ORDER BY sessions DESC`,[...params,CLICKS]),
    db.query(`WITH sess AS (${S}) SELECT count(*)::int AS sessions,count(*) FILTER (WHERE visitor_kind='RETURNING')::int AS returning,count(*) FILTER (WHERE visitor_kind='RETURNING' AND user_id IS NOT NULL)::int AS auth_returning,
        count(*) FILTER (WHERE visitor_kind='RETURNING' AND user_id IS NULL)::int AS anon_returning FROM sess`,params),
    db.query(`SELECT coalesce(sum(accepted),0)::int AS accepted,coalesce(sum(duplicates),0)::int AS duplicates,coalesce(sum(rejected),0)::int AS rejected,coalesce(sum(unknown_events),0)::int AS unknown,coalesce(sum(missing_session),0)::int AS missing,
        coalesce(sum(oversized),0)::int AS oversized,coalesce(sum(server_events),0)::int AS server_events,coalesce(max(max_lag_seconds),0)::int AS lag FROM analytics_ingestion_quality WHERE bucket>=$1 AND bucket<$2`,[from.toISOString(),to.toISOString()]),
    db.query(`SELECT traffic_class,count(*)::int AS events FROM analytics_events WHERE occurred_at>=$1 AND occurred_at<$2 GROUP BY 1 ORDER BY 2 DESC`,[from.toISOString(),to.toISOString()]),
    db.query(`SELECT max(received_at) AS at FROM analytics_events`),
  ]);
  const c=cards.rows[0]??{},f=funnel.rows[0]??{};
  const stages=[['Sessions',n(f.s0)],['Sports content view',n(f.s1)],['Odds selection',n(f.s2)],['Slip creation',n(f.s3)],['Bookmaker comparison',n(f.s4)],['Affiliate click',n(f.s5)]] as const;
  const funnelStages:FunnelStage[]=stages.map(([stage,sessions],i)=>({stage,sessions,fromPrevious:i===0?null:pct(sessions,stages[i-1][1]),fromSession:pct(sessions,stages[0][1])}));
  const ranked=(rows:Record<string,unknown>[]):RankedRow[]=>rows.map(r=>({key:String(r.key),label:String(r.label),views:n(r.views),sessions:n(r.sessions),slips:n(r.slips),clicks:n(r.clicks),rate:pct(n(r.clicks),Math.max(n(r.sessions),n(r.views)))}));
  const q=quality.rows[0]??{};const accepted=n(q.accepted),duplicates=n(q.duplicates),rejected=n(q.rejected);
  const flags:string[]=[];
  const lastAt=last.rows[0]?.at?new Date(String(last.rows[0].at)).toISOString():null;
  if(n(c.sessions)>0&&n(c.page_views)===0)flags.push('SESSIONS_WITHOUT_PAGE_VIEWS');
  if(accepted+duplicates>0&&duplicates/(accepted+duplicates)>0.2)flags.push('HIGH_DUPLICATE_RATE');
  if(accepted+rejected>0&&rejected/(accepted+rejected)>0.1)flags.push('HIGH_REJECTION_RATE');
  if(n(q.unknown)>0)flags.push('UNKNOWN_EVENT_TYPES');
  if(n(q.missing)>0)flags.push('MISSING_SESSION_IDS');
  if(n(q.lag)>900)flags.push('EVENT_LAG_OVER_15_MIN');
  if(n(c.affiliate_clicks)>0&&n(c.outbound)===0&&filters.window!=='today')flags.push('CLIENT_CLICKS_WITHOUT_SERVER_REDIRECTS');
  if(!lastAt||now.getTime()-Date.parse(lastAt)>6*3600000)flags.push('NO_EVENTS_RECEIVED_RECENTLY');
  return {filters,from:from.toISOString(),to:to.toISOString(),generatedAt:now.toISOString(),
    cards:{sessions:n(c.sessions),newVisitors:n(c.new_visitors),returningVisitors:n(c.returning_visitors),engagedSessions:n(c.engaged),contentViews:n(c.content_views),oddsSelections:n(c.odds_selections),slipsCreated:n(c.slips_created),
      comparisons:n(c.comparisons),affiliateClicks:n(c.affiliate_clicks),outboundRedirects:n(c.outbound),clickThroughRate:pct(n(f.s5),n(f.s0)),signIns:n(c.sign_ins),favoritesAdded:n(c.favorites_added),pageViews:n(c.page_views)},
    funnel:funnelStages,legBuckets:LEG_BUCKETS.map(b=>({bucket:b,sessions:n(legs.rows.find(r=>String(r.bucket)===b)?.sessions)})),
    comparisonStates:['REAL_COMPLETE','ESTIMATED_COMPLETE','INCOMPLETE'].map(s=>({state:s,sessions:n(states.rows.find(r=>String(r.state)===s)?.sessions)})),
    top:{landingPages:ranked(landing.rows),competitions:ranked(competitions.rows),teams:ranked(teams.rows),matches:ranked(matches.rows),placements:ranked(placements.rows),bookmakers:ranked(bookmakers.rows)},
    acquisition:acquisition.rows.map(r=>({source:String(r.source),sessions:n(r.sessions),engaged:n(r.engaged),slips:n(r.slips),clicks:n(r.clicks),rate:pct(n(r.clicks),n(r.sessions))})),
    campaigns:campaigns.rows.map(r=>({campaign:String(r.campaign),source:r.source?String(r.source):null,medium:r.medium?String(r.medium):null,sessions:n(r.sessions),slips:n(r.slips),clicks:n(r.clicks)})),
    locales:locales.rows.map(r=>({locale:String(r.locale),sessions:n(r.sessions),odds:n(r.odds),slips:n(r.slips),clicks:n(r.clicks),favorites:n(r.favorites),signIns:n(r.sign_ins)})),
    geos:geos.rows.map(r=>({geo:String(r.geo),sessions:n(r.sessions),odds:n(r.odds),slips:n(r.slips),clicks:n(r.clicks),favorites:n(r.favorites),signIns:n(r.sign_ins)})),
    retention:{returningShare:pct(n(retention.rows[0]?.returning),n(retention.rows[0]?.sessions)),authenticatedReturning:n(retention.rows[0]?.auth_returning),anonymousReturning:n(retention.rows[0]?.anon_returning)},
    quality:{accepted,duplicates,rejected,unknownEvents:n(q.unknown),missingSession:n(q.missing),oversized:n(q.oversized),serverEvents:n(q.server_events),maxLagSeconds:n(q.lag),duplicateRate:pct(duplicates,accepted+duplicates),
      trafficMix:mix.rows.map(r=>({trafficClass:String(r.traffic_class),events:n(r.events)})),flags,lastEventAt:lastAt}};
}
