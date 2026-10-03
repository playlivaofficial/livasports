import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {competitionDemand,geoProfile,type CoreGeo} from '@/config/geo';
import {gscProperty} from '@/seo/gsc';
import {bettingEvidence,demandProfile,emptyWindow,searchEvidence,DEMAND_POLICY,type BettingWindow,type DemandProfile} from './demand';

type Row=Record<string,unknown>;
const n=(row:Row,key:string)=>Number(row[key]??0);
export async function readGeoGrowthEvidence(db:QueryExecutor,geo:CoreGeo,canonicalUrls:string[],now:Date){
  const [activity,weights,search]=await Promise.all([
    db.query(`WITH events AS (
      SELECT e.session_id,e.event_name,e.occurred_at,f.id AS fixture_id,c.slug AS competition
      FROM analytics_events e JOIN analytics_sessions s ON s.session_id=e.session_id AND s.anonymous_id=e.anonymous_id
      JOIN LATERAL (
        SELECT id,competition_id FROM fixtures WHERE id=e.fixture_id
        UNION
        SELECT f.id,f.competition_id FROM fixtures f JOIN LATERAL (
          SELECT value AS public_id FROM jsonb_each_text(e.props) WHERE key ~ '^fixture[0-9]$' AND value ~ '^[a-f0-9]{16}$'
          UNION SELECT id FROM unnest(string_to_array(e.props->>'selectionFixtures',',')) id WHERE id ~ '^[a-f0-9]{16}$'
        ) linked ON linked.public_id=f.public_id WHERE e.fixture_id IS NULL
      ) f ON true JOIN competitions c ON c.id=f.competition_id
      WHERE e.geo=$1 AND s.traffic_class='HUMAN' AND e.traffic_class='HUMAN'
        AND e.occurred_at>=$2::timestamptz-interval '28 days' AND e.occurred_at<$2
        AND (e.event_name<>'outbound_redirect_completed' OR (e.source='server' AND EXISTS(
          SELECT 1 FROM affiliate_clicks ac WHERE ac.id=e.event_id AND ac.traffic_class='HUMAN' AND ac.geo=$1 AND ac.redirect_status='ISSUED_303')))
    ) SELECT w.days,e.competition,e.fixture_id,
      count(DISTINCT e.session_id)::int AS sessions,count(DISTINCT (e.occurred_at AT TIME ZONE 'UTC')::date)::int AS observed_days,
      count(DISTINCT e.fixture_id)::int AS fixtures,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='match_viewed')::int AS views,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='market_open')::int AS markets,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='odds_selected')::int AS selections,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='slip_leg_added')::int AS slip_adds,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='bookmaker_comparison_viewed')::int AS comparisons,
      count(DISTINCT e.session_id) FILTER(WHERE event_name IN('affiliate_cta_clicked','bookmaker_logo_clicked'))::int AS bookmaker_interactions,
      count(DISTINCT e.session_id) FILTER(WHERE event_name='outbound_redirect_completed')::int AS outbound
      FROM events e CROSS JOIN (VALUES(7),(14),(28)) w(days)
      WHERE e.occurred_at>=$2::timestamptz-w.days*interval '1 day'
      GROUP BY GROUPING SETS((w.days,e.competition,e.fixture_id),(w.days,e.competition))`,[geo,now]),
    db.query('SELECT competition_slug,adjustment,evaluated_week::text FROM growth_geo_demand WHERE geo=$1',[geo]),
    canonicalUrls.length?db.query(`SELECT key,CASE WHEN day>=$3::date-27 THEN 'current' ELSE 'previous' END AS period,
      sum(impressions)::int AS impressions,sum(clicks)::int AS clicks,
      coalesce(sum(position*impressions)/nullif(sum(impressions),0),0) AS position,count(DISTINCT day)::int AS days
      FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND key=ANY($2::text[])
      AND day BETWEEN $3::date-55 AND $3::date GROUP BY key,period`,[gscProperty(),canonicalUrls,new Date(now.getTime()-3*86400000).toISOString().slice(0,10)]):Promise.resolve({rows:[]}),
  ]);
  const windows=(rows:Row[])=>DEMAND_POLICY.windows.map(days=>{const r=rows.find(r=>n(r,'days')===days);return r?{days,sessions:n(r,'sessions'),observedDays:n(r,'observed_days'),fixtures:n(r,'fixtures'),views:n(r,'views'),markets:n(r,'markets'),selections:n(r,'selections'),slipAdds:n(r,'slip_adds'),comparisons:n(r,'comparisons'),bookmakerInteractions:n(r,'bookmaker_interactions'),outbound:n(r,'outbound')}:emptyWindow(days);}) as BettingWindow[];
  const fixtures=new Map([...new Set(activity.rows.filter(r=>r.fixture_id).map(r=>String(r.fixture_id)))].map(id=>[id,bettingEvidence(geo,windows(activity.rows.filter(r=>r.fixture_id===id)))]));
  const competitions=[...new Set([...Object.keys(geoProfile(geo).competitionWeights),...activity.rows.map(r=>String(r.competition))])];
  const demand=competitions.map(slug=>demandProfile(slug,competitionDemand(geo,slug)/30,Number(weights.rows.find(r=>r.competition_slug===slug)?.adjustment??0),bettingEvidence(geo,windows(activity.rows.filter(r=>r.competition===slug&&r.fixture_id===null)))));
  // Read-only scoring uses the committed weekly adjustment, not an uncommitted proposal.
  const adjustments=new Map(weights.rows.map(r=>[String(r.competition_slug),Number(r.adjustment)]));
  const searchByUrl=new Map(canonicalUrls.map(url=>{const r=search.rows.find(r=>r.key===url&&r.period==='current')??{},previous=search.rows.find(r=>r.key===url&&r.period==='previous');return [url,searchEvidence({impressions:n(r,'impressions'),clicks:n(r,'clicks'),position:n(r,'position'),days:n(r,'days')},Number(previous?.clicks??0))];}));
  return {fixtures,demand,adjustments,search:searchByUrl};
}
export async function persistGeoDemand(db:DatabaseClient,geo:CoreGeo,profiles:DemandProfile[],now:Date){
  const monday=new Date(now);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=monday.toISOString().slice(0,10);
  const committed=new Map<string,number>();
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`growth:demand:${geo}`]);
    for(const p of profiles){
      const previous=(await tx.query('SELECT adjustment,evaluated_week::text FROM growth_geo_demand WHERE geo=$1 AND competition_slug=$2',[geo,p.competition])).rows[0];
      if(previous&&String(previous.evaluated_week)>=week){committed.set(p.competition,Number(previous.adjustment));continue;}
      const fresh=demandProfile(p.competition,p.seed,Number(previous?.adjustment??0),p.evidence);
      const values=[geo,p.competition,week,fresh.adjustment,JSON.stringify(fresh),now];
      await tx.query(`INSERT INTO growth_geo_demand(geo,competition_slug,evaluated_week,adjustment,evidence,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)
        ON CONFLICT(geo,competition_slug) DO UPDATE SET evaluated_week=$3,adjustment=$4,evidence=$5::jsonb,updated_at=$6`,values);
      await tx.query(`INSERT INTO growth_geo_demand_history(geo,competition_slug,evaluated_week,previous_adjustment,new_adjustment,evidence,created_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(geo,competition_slug,evaluated_week) DO NOTHING`,[geo,p.competition,week,fresh.previous,fresh.adjustment,JSON.stringify(fresh),now]);
      committed.set(p.competition,fresh.adjustment);
    }
  });
  return committed;
}
