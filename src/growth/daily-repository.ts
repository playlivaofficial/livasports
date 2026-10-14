import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {CoreGeo} from '@/config/geo';
import {gscProperty} from '@/seo/gsc';
import {gscWindows} from '@/seo/gsc-ingest';
import {DAILY_GROWTH_VERSION,growthLocalDay,nextGrowthCheck} from './daily-policy';
import type {CountryDemand} from './country-demand';

export interface DailySelection {fixtureId:string;rank:number;score:number;label:string;canonicalUrl:string;kickoff:string;competition:string;[key:string]:unknown;}
export interface DailyGrowthRun {id:string;localDay:string;state:string;trigger:string;startedAt:string;finishedAt:string|null;lastCheckedAt:string|null;checkCount:number;considered:number;eligible:number;selectedCount:number;changed:boolean;selection:DailySelection[];countryEvidence:CountryDemand|null;error:string|null;}
export interface DailyFixtureMeasurement {fixtureId:string;url:string;impressions:number|null;clicks:number|null;position:number|null;countryImpressions:number|null;countryClicks:number|null;organicSessions:number;organicReferrals:number;}
export interface DailyGrowthReport {version:string;localDay:string;nextCheck:string;lastSuccess:DailyGrowthRun|null;runs:DailyGrowthRun[];active:DailySelection[];measurements:DailyFixtureMeasurement[];window:{from:string;to:string};}

/** A cheap hourly validity check; it neither re-scores nor writes still-valid same-day placements. */
export async function dailyGeoNeedsRanking(db:QueryExecutor,geo:CoreGeo,now:Date){
 const r=(await db.query(`SELECT r.id FROM growth_geo_runs r
  WHERE r.geo=$1 AND r.local_day=$2::date AND r.config_version=$3 AND r.state='SUCCEEDED'
   AND r.started_at>$4::timestamptz-interval '24 hours' AND r.selected_count=5
   AND NOT EXISTS(SELECT 1 FROM seo_breakdown_syncs s WHERE s.property=$5 AND s.dimension='COUNTRY' AND s.state='SUCCEEDED'
    AND s.captured_at<=$4 AND date_trunc('milliseconds',s.captured_at)>coalesce((r.country_evidence->>'capturedAt')::timestamptz,'1970-01-01'::timestamptz))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.selection) picked
    LEFT JOIN growth_geo_priorities p ON p.geo=r.geo AND p.fixture_id=(picked->>'fixtureId')::uuid AND p.active
    LEFT JOIN fixtures f ON f.id=p.fixture_id
    WHERE p.fixture_id IS NULL OR p.priority_rank<>(picked->>'rank')::integer OR p.priority_score<>(picked->>'score')::numeric
     OR p.canonical_url<>(picked->>'canonicalUrl') OR f.kickoff<>(picked->>'kickoff')::timestamptz)
   AND (SELECT count(*) FROM growth_geo_priorities p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
     JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
     WHERE p.geo=$1 AND p.active AND c.enabled AND f.status='SCHEDULED' AND f.kickoff>$4 AND f.kickoff<=$4::timestamptz+interval '7 days'
      AND NOT ht.provider_placeholder AND NOT at.provider_placeholder AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures pending WHERE pending.id=f.id))=5
  ORDER BY r.started_at DESC,r.id DESC LIMIT 1`,[geo,growthLocalDay(geo,now),DAILY_GROWTH_VERSION,now,gscProperty()])).rows[0];
 return !r;
}
export async function startDailyGeoRun(db:QueryExecutor,geo:CoreGeo,trigger:'AUTOMATIC'|'OWNER',now:Date){
 await db.query("UPDATE growth_geo_runs SET state='FAILED',finished_at=$2,error_code='INTERRUPTED' WHERE geo=$1 AND state='RUNNING' AND started_at<$2::timestamptz-interval '10 minutes'",[geo,now]);
 const row=(await db.query(`INSERT INTO growth_geo_runs(geo,local_day,trigger_source,config_version,state,started_at)
  VALUES($1,$2,$3,$4,'RUNNING',$5) RETURNING id`,[geo,growthLocalDay(geo,now),trigger,DAILY_GROWTH_VERSION,now])).rows[0];
 return row?String(row.id):null;
}
/** Records a real automatic validity check without rewriting the shortlist or producing another daily snapshot. */
export async function markDailyGrowthCheck(db:QueryExecutor,geo:CoreGeo,now:Date){
 await db.query(`UPDATE growth_geo_runs SET last_checked_at=$2,check_count=check_count+1
  WHERE id=(SELECT id FROM growth_geo_runs WHERE geo=$1 AND state='SUCCEEDED' AND config_version=$3 ORDER BY started_at DESC,id DESC LIMIT 1)
   AND (last_checked_at IS NULL OR last_checked_at<$2)`,[geo,now,DAILY_GROWTH_VERSION]);
}
export async function finishDailyGeoRun(db:QueryExecutor,id:string|null,result:{state:'SUCCEEDED'|'FAILED'|'SUPERSEDED';considered?:number;eligible?:number;selection?:DailySelection[];country?:CountryDemand;changed?:boolean;error?:string},now:Date){
 if(!id)return;
 await db.query(`UPDATE growth_geo_runs SET state=$2,finished_at=$3,considered=$4,eligible=$5,selected_count=$6,changed=$7,
  selection=$8::jsonb,country_evidence=$9::jsonb,error_code=$10,
  last_checked_at=CASE WHEN trigger_source='AUTOMATIC' AND $2='SUCCEEDED' THEN $3 ELSE last_checked_at END,
  check_count=CASE WHEN trigger_source='AUTOMATIC' AND $2='SUCCEEDED' THEN check_count+1 ELSE check_count END
  WHERE id=$1 AND state='RUNNING'`,
 [id,result.state,now,result.considered??0,result.eligible??0,result.state==='SUCCEEDED'?(result.selection?.length??0):0,result.changed??false,JSON.stringify(result.selection??[]),JSON.stringify(result.country??{}),result.error??null]);
}
const iso=(v:unknown)=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
const parse=<T>(v:unknown):T=>typeof v==='string'?JSON.parse(v):v as T;
export async function readDailyGrowthReport(db:DatabaseClient,geo:CoreGeo,now:Date):Promise<DailyGrowthReport|null>{
 const window=gscWindows(now).current28;
 try{
  const raw=(await db.query(`WITH recent AS (SELECT id FROM growth_geo_runs WHERE geo=$1 ORDER BY started_at DESC,id DESC LIMIT 12),
   success AS (SELECT id FROM growth_geo_runs WHERE geo=$1 AND state='SUCCEEDED' ORDER BY started_at DESC,id DESC LIMIT 1)
   SELECT id,local_day::text,state,trigger_source,started_at,finished_at,last_checked_at,check_count,considered,eligible,selected_count,changed,selection,country_evidence,error_code
   FROM growth_geo_runs WHERE id IN(SELECT id FROM recent UNION SELECT id FROM success) ORDER BY started_at DESC,id DESC`,[geo])).rows;
  const runs=raw.map(r=>({id:String(r.id),localDay:String(r.local_day),state:String(r.state),trigger:String(r.trigger_source),startedAt:iso(r.started_at),finishedAt:r.finished_at?iso(r.finished_at):null,
   lastCheckedAt:r.last_checked_at?iso(r.last_checked_at):null,checkCount:Number(r.check_count??0),considered:Number(r.considered),eligible:Number(r.eligible),selectedCount:Number(r.selected_count),changed:r.changed===true,selection:parse<DailySelection[]>(r.selection),countryEvidence:parse<CountryDemand|null>(r.country_evidence),error:r.error_code?String(r.error_code):null}));
  const active=(await db.query(`SELECT p.fixture_id,p.priority_rank,p.priority_score,p.canonical_url,f.kickoff,c.slug,ht.name AS home,at.name AS away
   FROM growth_geo_priorities p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
   WHERE p.geo=$1 AND p.active AND c.enabled AND f.status='SCHEDULED' AND f.kickoff>$2 AND f.kickoff<=$2::timestamptz+interval '7 days'
    AND NOT ht.provider_placeholder AND NOT at.provider_placeholder AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures pending WHERE pending.id=f.id)
   ORDER BY p.priority_rank LIMIT 5`,[geo,now])).rows.map(r=>({fixtureId:String(r.fixture_id),rank:Number(r.priority_rank),score:Number(r.priority_score),label:`${r.home} × ${r.away}`,canonicalUrl:String(r.canonical_url),kickoff:iso(r.kickoff),competition:String(r.slug)}));
  const tracked=new Map([...runs.flatMap(r=>r.selection),...active].map(r=>[r.fixtureId,r])),ids=[...tracked.keys()],urls=[...tracked.values()].map(r=>r.canonicalUrl);
  const [page,country,organic]=await Promise.all([
   urls.length?db.query(`SELECT key AS url,sum(impressions)::int AS impressions,sum(clicks)::int AS clicks,coalesce(sum(position*impressions)/nullif(sum(impressions),0),0) AS position
    FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND key=ANY($2::text[]) AND day BETWEEN $3 AND $4 GROUP BY key`,[gscProperty(),urls,window.from,window.to]):Promise.resolve({rows:[]}),
   urls.length?db.query(`SELECT page AS url,sum(impressions)::int AS impressions,sum(clicks)::int AS clicks FROM seo_page_breakdowns WHERE property=$1 AND dimension='COUNTRY' AND lower(key)=$2
    AND page=ANY($3::text[]) AND day BETWEEN $4 AND $5 GROUP BY page`,[gscProperty(),({MX:'mex',CO:'col',PE:'per'} as const)[geo],urls,window.from,window.to]):Promise.resolve({rows:[]}),
   ids.length?db.query(`WITH events AS (
    SELECT e.event_id,e.event_name,e.source,e.session_id,e.fixture_id AS direct_id,e.props FROM analytics_events e
    JOIN analytics_sessions s ON s.session_id=e.session_id AND s.anonymous_id=e.anonymous_id
    WHERE e.geo=$1 AND e.traffic_class='HUMAN' AND s.traffic_class='HUMAN' AND s.referrer_class IN('google_organic','bing_organic','other_search')
     AND e.occurred_at>=$2::timestamptz-interval '28 days' AND e.occurred_at<$2
   ), mapped AS (
    SELECT e.*,f.id AS fixture_id FROM events e JOIN LATERAL (
     SELECT id FROM fixtures WHERE id=e.direct_id
     UNION SELECT f.id FROM fixtures f JOIN LATERAL (
      SELECT value AS public_id FROM jsonb_each_text(e.props) WHERE key ~ '^fixture[0-9]$' AND value ~ '^[a-f0-9]{16}$'
      UNION SELECT id FROM unnest(string_to_array(e.props->>'selectionFixtures',',')) id WHERE id ~ '^[a-f0-9]{16}$'
     ) linked ON linked.public_id=f.public_id WHERE e.direct_id IS NULL
    ) f ON true
   ) SELECT fixture_id,count(DISTINCT session_id) FILTER(WHERE event_name='match_viewed')::int AS sessions,
    count(DISTINCT session_id) FILTER(WHERE event_name='outbound_redirect_completed' AND source='server' AND EXISTS(
     SELECT 1 FROM affiliate_clicks ac WHERE ac.id=event_id AND ac.geo=$1 AND ac.traffic_class='HUMAN' AND ac.redirect_status='ISSUED_303'))::int AS referrals
    FROM mapped WHERE fixture_id=ANY($3::uuid[]) GROUP BY fixture_id`,[geo,now,ids]):Promise.resolve({rows:[]}),
  ]);
  const measurements=[...tracked.values()].map(r=>{const p=page.rows.find(p=>p.url===r.canonicalUrl),c=country.rows.find(c=>c.url===r.canonicalUrl),o=organic.rows.find(o=>o.fixture_id===r.fixtureId);
   return {fixtureId:r.fixtureId,url:r.canonicalUrl,impressions:p?Number(p.impressions):null,clicks:p?Number(p.clicks):null,position:p?Number(p.position):null,countryImpressions:c?Number(c.impressions):null,countryClicks:c?Number(c.clicks):null,
    organicSessions:Number(o?.sessions??0),organicReferrals:Number(o?.referrals??0)};});
  return {version:DAILY_GROWTH_VERSION,localDay:growthLocalDay(geo,now),nextCheck:nextGrowthCheck(now),lastSuccess:runs.find(r=>r.state==='SUCCEEDED')??null,runs,active,measurements,window};
 }catch(error){if(['42P01','42703'].includes(String((error as {code?:string}).code)))return null;throw error;}
}
