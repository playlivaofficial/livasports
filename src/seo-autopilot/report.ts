import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscWindows} from '@/seo/gsc-ingest';
import {gscProperty} from '@/seo/gsc';
import {aggregate,collapse,nearPageOne,ctrOpportunities,compare,growthPages,losingVisibility,type SearchRow} from '@/seo/intelligence';
import {SEO_AUTOPILOT as config} from './config';

export async function readAutopilotReport(db:QueryExecutor,days:7|28|90=28,now=new Date()){
  const to=gscWindows(now).latestComplete,from=new Date(Date.parse(to)-(days-1)*86_400_000).toISOString().slice(0,10);
  const previousFrom=new Date(Date.parse(from)-days*86_400_000).toISOString().slice(0,10);
  const [raw,pages,decisions,runs,technical,sitemaps,clusters,organic,indexable]=await Promise.all([
    db.query(`SELECT day::text,dimension,key,clicks,impressions,ctr,position FROM seo_search_daily WHERE property=$1 AND day BETWEEN $2 AND $3`,[gscProperty(),previousFrom,to]),
    db.query<{url:string;state:string;tier:string;score:number;reasons:string[];published_at:string|null;first_impression:string|null}>(`SELECT p.*, (SELECT min(d.day)::text FROM seo_search_daily d WHERE d.property=$1 AND d.dimension='PAGE' AND d.key=p.url AND d.impressions>0) AS first_impression
      FROM seo_autopilot_pages p ORDER BY p.score DESC LIMIT 100`,[gscProperty()]),
    db.query('SELECT url,action,reason,previous_state,new_state,created_at,config_version,release_sha FROM seo_autopilot_decisions ORDER BY id DESC LIMIT 80'),
    db.query('SELECT id,day::text,state,started_at,finished_at,summary FROM seo_autopilot_runs ORDER BY started_at DESC LIMIT 10'),
    db.query("SELECT url,status,problems,checked_at FROM seo_autopilot_technical WHERE problems<>'[]'::jsonb ORDER BY checked_at DESC LIMIT 60"),
    db.query('SELECT * FROM seo_autopilot_sitemaps ORDER BY path'),
    db.query('SELECT * FROM seo_autopilot_clusters ORDER BY boost DESC,cluster'),
    db.query(`SELECT count(*)::int AS sessions,count(*) FILTER(WHERE s.engaged)::int AS engaged,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class='HUMAN' AND e.event_name='match_viewed'))::int AS match_sessions,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class='HUMAN' AND e.event_name IN('slip_leg_added','bookmaker_comparison_viewed')))::int AS commercial_sessions,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class='HUMAN' AND e.event_name='outbound_redirect_completed' AND e.source='server'))::int AS outbound_sessions
      FROM analytics_sessions s WHERE s.traffic_class='HUMAN' AND s.referrer_class IN('google_organic','bing_organic','other_search')
      AND s.started_at >= $1::date AND s.started_at<$2::date+interval '1 day'`,[from,to]),
    db.query("SELECT submitted_total,captured_day::text FROM seo_snapshots WHERE source='TECHNICAL' ORDER BY captured_day DESC LIMIT 1"),
  ]);
  const metrics=(rows:typeof raw.rows):SearchRow[]=>rows.map(r=>({key:String(r.key),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)}));
  const cur=(dimension:string)=>raw.rows.filter(r=>r.dimension===dimension&&String(r.day)>=from);
  const currentPages=collapse(metrics(cur('PAGE'))),queries=collapse(metrics(cur('QUERY')));
  const movements=compare(currentPages,metrics(raw.rows.filter(r=>r.dimension==='PAGE'&&String(r.day)<from)));
  const totals=aggregate(metrics(cur('TOTAL'))),daysObserved=cur('TOTAL').length;
  return {config,days,from,to,daysObserved,totals,nonBrandClicks:aggregate(queries.filter(q=>!/(liva\s*sports|livasport)/i.test(q.key))).clicks,
    nonBrandCaveat:'Reported queries only; Google omits anonymized queries.',top10Queries:queries.filter(r=>r.position>0&&r.position<=10).length,
    top20Queries:queries.filter(r=>r.position>0&&r.position<=20).length,top10Pages:currentPages.filter(r=>r.position>0&&r.position<=10).length,
    top20Pages:currentPages.filter(r=>r.position>0&&r.position<=20).length,
    trend:cur('TOTAL').map(r=>({day:String(r.day),clicks:Number(r.clicks),impressions:Number(r.impressions)})).sort((a,b)=>a.day.localeCompare(b.day)),
    striking:nearPageOne(currentPages).slice(0,15),ctr:ctrOpportunities(currentPages).slice(0,15),winners:growthPages(movements).slice(0,10),decay:losingVisibility(movements).slice(0,10),
    pages:pages.rows.map(p=>({...p,performance:currentPages.find(r=>r.key===p.url)??null})),decisions:decisions.rows,runs:runs.rows,technical:technical.rows,
    sitemaps:sitemaps.rows,clusters:clusters.rows,organic:organic.rows[0],indexable:indexable.rows[0]??null,indexed:null,providerRequests:0};
}
export type AutopilotReport=Awaited<ReturnType<typeof readAutopilotReport>>;
