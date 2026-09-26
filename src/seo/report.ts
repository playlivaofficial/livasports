import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {buildSeoScorecard,INTENTIONALLY_UNSUBMITTED,SEO_THRESHOLDS,type ScorecardEntry,type SeoAlert,type SeoProblem,type SeoSnapshot} from './monitoring';
import {gscProperty,gscStatus,type GscStatus} from './gsc';
import {aggregate,byLocale,BRAZIL_COUNTRY,compare,countryTotals,ctrOpportunities,growthPages,
  losingVisibility,nearPageOne,SEARCH_THRESHOLDS,topBy,type CtrOpportunity,type Movement,type SearchRow,type Totals} from './intelligence';
import {gscWindows,type GscWindow} from './gsc-ingest';

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


export interface SeoSearchReport {
  property:string;
  windows:{current7:GscWindow;previous7:GscWindow;current28:GscWindow;previous28:GscWindow;latestComplete:string};
  totals7:Totals;previous7:Totals;totals28:Totals;previous28:Totals;
  topQueries:SearchRow[];topPages:SearchRow[];
  growthPages:Movement[];losingPages:Movement[];
  nearPageOneQueries:SearchRow[];ctrOpportunities:CtrOpportunity[];
  brazil7:Totals;locales7:Array<{locale:string}&Totals>;devices7:SearchRow[];
  lastSync:{state:string;finishedAt:string|null;days:number;rows:number;truncated:boolean;error:string|null}|null;
  sitemaps:Array<{path:string;submitted:number;indexed:number|null;errors:number;warnings:number;lastDownloaded:string|null}>;
  hasData:boolean;
  thresholds:typeof SEARCH_THRESHOLDS;
}

const rowsOf=(raw:Array<Record<string,unknown>>):SearchRow[]=>raw.map(r=>({key:String(r.key??''),
  clicks:Number(r.clicks??0),impressions:Number(r.impressions??0),ctr:Number(r.ctr??0),position:Number(r.position??0)}));

/**
 * Search Console side of the owner report. Every figure comes from stored daily rows, so an empty result
 * means "not ingested yet" and is rendered as such — never as zero clicks.
 */
export async function readSeoSearchReport(db:QueryExecutor,now=new Date()):Promise<SeoSearchReport>{
  const property=gscProperty();
  const w=gscWindows(now);
  const read=async(dimension:string,from:string,to:string)=>rowsOf((await db.query(
    `SELECT key,clicks,impressions,ctr,position FROM seo_search_daily
     WHERE property=$1 AND dimension=$2 AND day>=$3::date AND day<=$4::date`,[property,dimension,from,to])).rows);

  const [t7,p7,t28,p28,pages7,pagesPrev7,queries7,countries7,devices7]=await Promise.all([
    read('TOTAL',w.current7.from,w.current7.to),read('TOTAL',w.previous7.from,w.previous7.to),
    read('TOTAL',w.current28.from,w.current28.to),read('TOTAL',w.previous28.from,w.previous28.to),
    read('PAGE',w.current7.from,w.current7.to),read('PAGE',w.previous7.from,w.previous7.to),
    read('QUERY',w.current7.from,w.current7.to),read('COUNTRY',w.current7.from,w.current7.to),
    read('DEVICE',w.current7.from,w.current7.to),
  ]);
  const pageMovements=compare(pages7,pagesPrev7);
  const sync=(await db.query(`SELECT state,finished_at,days_ingested,rows_ingested,truncated,error_code
    FROM seo_gsc_syncs ORDER BY started_at DESC LIMIT 1`)).rows[0];
  const sitemaps=(await db.query(`SELECT DISTINCT ON (path) path,submitted,indexed,errors,warnings,last_downloaded
    FROM seo_sitemap_status WHERE property=$1 ORDER BY path,captured_day DESC`,[property])).rows;

  return {property,
    windows:{current7:w.current7,previous7:w.previous7,current28:w.current28,previous28:w.previous28,latestComplete:w.latestComplete},
    totals7:aggregate(t7),previous7:aggregate(p7),totals28:aggregate(t28),previous28:aggregate(p28),
    topQueries:topBy(queries7,'impressions',10),topPages:topBy(pages7,'impressions',10),
    growthPages:growthPages(pageMovements).slice(0,10),losingPages:losingVisibility(pageMovements).slice(0,10),
    nearPageOneQueries:nearPageOne(queries7).slice(0,10),ctrOpportunities:ctrOpportunities(queries7).slice(0,10),
    brazil7:countryTotals(countries7,BRAZIL_COUNTRY),locales7:byLocale(pages7),devices7:topBy(devices7,'impressions',5),
    lastSync:sync?{state:String(sync.state),finishedAt:sync.finished_at?new Date(sync.finished_at as string).toISOString():null,
      days:Number(sync.days_ingested??0),rows:Number(sync.rows_ingested??0),truncated:Boolean(sync.truncated),
      error:sync.error_code?String(sync.error_code):null}:null,
    sitemaps:sitemaps.map(s=>({path:String(s.path),submitted:Number(s.submitted??0),
      indexed:s.indexed===null||s.indexed===undefined?null:Number(s.indexed),
      errors:Number(s.errors??0),warnings:Number(s.warnings??0),
      lastDownloaded:s.last_downloaded?new Date(s.last_downloaded as string).toISOString():null})),
    hasData:t28.length>0,thresholds:SEARCH_THRESHOLDS};
}
