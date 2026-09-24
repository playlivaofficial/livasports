import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {buildSeoScorecard,INTENTIONALLY_UNSUBMITTED,SEO_THRESHOLDS,type ScorecardEntry,type SeoAlert,type SeoProblem,type SeoSnapshot} from './monitoring';
import {gscStatus,type GscStatus} from './gsc';

export interface SeoReport {
  generatedAt:string;
  latest:(SeoSnapshot&{day:string;durationMs:number|null})|null;
  previous:(SeoSnapshot&{day:string})|null;
  history:Array<{day:string;submittedTotal:number;problemCount:number;families:SeoSnapshot['families']}>;
  alerts:SeoAlert[];
  scorecard:ScorecardEntry[];
  gsc:GscStatus;
  thresholds:typeof SEO_THRESHOLDS;
  unsubmitted:typeof INTENTIONALLY_UNSUBMITTED;
}

const toSnapshot=(row:Record<string,unknown>)=>({
  capturedAt:new Date(row.captured_at as string).toISOString(),
  day:String(row.captured_day instanceof Date?(row.captured_day as Date).toISOString().slice(0,10):row.captured_day),
  submittedTotal:Number(row.submitted_total),
  families:(row.families??{}) as SeoSnapshot['families'],
  locales:(row.locales??{}) as Record<string,number>,
  sampled:Number(row.sampled??0),
  problems:(row.problems??[]) as SeoProblem[],
  robotsOk:row.robots_ok===null||row.robots_ok===undefined?null:Boolean(row.robots_ok),
  durationMs:row.duration_ms===null||row.duration_ms===undefined?null:Number(row.duration_ms),
});

/** Owner SEO read model. Pure reads; renders NOT_CONNECTED rather than inventing Search Console numbers. */
export async function readSeoReport(db:QueryExecutor,now=new Date()):Promise<SeoReport>{
  const rows=(await db.query(`SELECT id,captured_at,captured_day,submitted_total,families,locales,sampled,problems,problem_count,robots_ok,duration_ms
    FROM seo_snapshots WHERE source='TECHNICAL' ORDER BY captured_day DESC LIMIT 30`)).rows as Array<Record<string,unknown>>;
  const latest=rows[0]?toSnapshot(rows[0]):null;
  const previous=rows[1]?toSnapshot(rows[1]):null;
  const alerts=latest?((await db.query(`SELECT code,severity,url_family,reason,current_value,baseline_value
    FROM seo_alerts WHERE snapshot_id=$1 ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,code`,
    [rows[0].id])).rows.map(r=>({code:String(r.code),severity:r.severity as SeoAlert['severity'],
      urlFamily:r.url_family?String(r.url_family):null,reason:String(r.reason),
      current:String(r.current_value??''),baseline:String(r.baseline_value??'')}))):[];
  const gsc=gscStatus();
  return {generatedAt:now.toISOString(),latest,previous,
    history:rows.map(r=>({day:toSnapshot(r).day,submittedTotal:Number(r.submitted_total),
      problemCount:Number(r.problem_count??0),families:(r.families??{}) as SeoSnapshot['families']})).reverse(),
    alerts,scorecard:latest?buildSeoScorecard(latest,previous,alerts,{state:gsc.state}):[],
    gsc,thresholds:SEO_THRESHOLDS,unsubmitted:INTENTIONALLY_UNSUBMITTED};
}
