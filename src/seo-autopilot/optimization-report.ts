import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {readGrowthEvidence} from './optimization-data';
export async function readOptimizationReport(db:QueryExecutor,now=new Date()){
  try{
    const evidence=await readGrowthEvidence(db,now);
    const [actions,experiments,observations,weights,organic,weekly]=await Promise.all([
      db.query('SELECT * FROM seo_growth_actions ORDER BY id DESC LIMIT 60'),
      db.query('SELECT * FROM seo_growth_experiments ORDER BY started_at DESC LIMIT 30'),
      db.query('SELECT * FROM seo_growth_observations ORDER BY measured_at DESC LIMIT 90'),
      db.query('SELECT *,evaluated_week::text AS evaluated_week FROM seo_all_cluster_weights ORDER BY adjustment DESC,cluster'),
      db.query(`SELECT count(*)::int AS sessions,count(*) FILTER(WHERE s.engaged)::int AS engaged,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class='HUMAN' AND e.event_name='bookmaker_comparison_viewed'))::int AS comparisons,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class='HUMAN' AND e.event_name='outbound_redirect_completed' AND e.source='server'))::int AS outbounds
        FROM analytics_sessions s WHERE s.traffic_class='HUMAN' AND s.referrer_class IN('google_organic','bing_organic','other_search')
        AND s.started_at>=$1::date AND s.started_at<$2::date+interval '1 day'`,[evidence.from,evidence.to]),
      db.query('SELECT week::text,report,created_at FROM seo_growth_weekly ORDER BY week DESC LIMIT 4'),
    ]);
    const q=organic.rows[0]??{},n=Number(q.sessions??0),rate=(v:unknown)=>n?`${(Number(v??0)/n*100).toFixed(1)}%`:'Insufficient data';
    return {evidence,actions:actions.rows,experiments:experiments.rows,observations:observations.rows,weights:weights.rows,weekly:weekly.rows,
      quality:{sessions:n,engagementRate:rate(q.engaged),comparisonRate:rate(q.comparisons),affiliateIntentRate:rate(q.outbounds)}};
  }catch{return null;}
}
