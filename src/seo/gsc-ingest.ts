import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscCredential,gscProperty,gscStatus,type GscState} from './gsc';
import {accessTokenFor,GscApiError,listSitemaps,searchAnalytics,type SearchAnalyticsRow} from './gsc-client';

/**
 * Daily Search Console ingestion.
 *
 * Search Console finalises a day's data a couple of days late, so every window here is built from
 * *complete* days only and requested with `dataState: 'final'`. Nothing partial is ever compared against
 * a full historical day — that single rule is what makes the 7d/28d deltas trustworthy.
 */
export const GSC_FINAL_LAG_DAYS=3;
/** Per-dimension ceiling for one run. Generous for this site, and reported rather than silently applied. */
export const GSC_ROW_CEILING=25_000;

/** Only the variables this module reads; keeps callers and tests from needing a whole ProcessEnv. */
export type GscEnv={GSC_SERVICE_ACCOUNT_JSON?:string;GSC_REFRESH_TOKEN?:string;GSC_CLIENT_ID?:string;GSC_CLIENT_SECRET?:string;GSC_PROPERTY?:string};

const iso=(date:Date)=>date.toISOString().slice(0,10);
const addDays=(date:Date,days:number)=>new Date(date.getTime()+days*86_400_000);

export interface GscWindow {from:string;to:string;days:number}
export interface GscWindows {latestComplete:string;current7:GscWindow;previous7:GscWindow;current28:GscWindow;previous28:GscWindow}

/**
 * Complete-day windows. `latestComplete` is the newest day Search Console is expected to have finalised;
 * the current window ends there and the previous window is the same length immediately before it, so the
 * two are always like-for-like.
 */
export function gscWindows(now=new Date(),lagDays=GSC_FINAL_LAG_DAYS):GscWindows{
  const latest=addDays(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),-lagDays);
  const window=(endOffset:number,length:number):GscWindow=>{
    const to=addDays(latest,-endOffset);
    return {from:iso(addDays(to,-(length-1))),to:iso(to),days:length};
  };
  return {latestComplete:iso(latest),
    current7:window(0,7),previous7:window(7,7),
    current28:window(0,28),previous28:window(28,28)};
}

export type IngestDimension='TOTAL'|'PAGE'|'QUERY'|'COUNTRY'|'DEVICE';
const DIMENSION_KEYS:Record<IngestDimension,string[]>={
  TOTAL:['date'],PAGE:['date','page'],QUERY:['date','query'],COUNTRY:['date','country'],DEVICE:['date','device']};

export interface GscIngestResult {
  state:GscState;property:string;from:string;to:string;
  days:number;rows:number;truncated:boolean;error?:string;sitemaps:number;
}

/** A Search Analytics row keyed by ['date', ...] flattened into a storable record. */
function toRecord(dimension:IngestDimension,row:SearchAnalyticsRow){
  const [day,key]=row.keys;
  return {day,key:dimension==='TOTAL'?'':String(key??''),
    clicks:Number(row.clicks??0),impressions:Number(row.impressions??0),
    ctr:Number(row.ctr??0),position:Number(row.position??0)};
}

/**
 * Ingest the 28-day window in one pass. Every dimension is requested per day, so re-running the job
 * overwrites the same primary keys instead of appending — the run is idempotent by construction.
 */
export async function ingestGscSearchAnalytics(db:QueryExecutor,
  options:{now?:Date;fetcher?:typeof fetch;env?:GscEnv;dimensions?:IngestDimension[]}={}):Promise<GscIngestResult>{
  const now=options.now??new Date();
  const env=(options.env??process.env) as GscEnv;
  const property=gscProperty(env as {GSC_PROPERTY?:string});
  const windows=gscWindows(now);
  const empty={property,from:windows.current28.from,to:windows.current28.to,days:0,rows:0,truncated:false,sitemaps:0};

  const status=gscStatus(env as never,now);
  const credential=gscCredential(env as never);
  if(!credential)return {...empty,state:status.state==='CONNECTED'?'NOT_CONNECTED':status.state,error:status.missing};

  const sync=(await db.query<{id:string}>(
    `INSERT INTO seo_gsc_syncs(property,state) VALUES($1,'RUNNING') RETURNING id`,[property])).rows[0];
  const finish=async(state:GscState,result:Partial<GscIngestResult>,error?:string)=>{
    await db.query(`UPDATE seo_gsc_syncs SET finished_at=now(),state=$2,days_ingested=$3,rows_ingested=$4,truncated=$5,error_code=$6 WHERE id=$1`,
      [sync.id,state,result.days??0,result.rows??0,result.truncated??false,error??null]).catch(()=>undefined);
    return {...empty,...result,state,property,...(error?{error}:{})} as GscIngestResult;
  };

  try{
    const token=await accessTokenFor(credential,options.fetcher??fetch,now.getTime());
    const dimensions=options.dimensions??(['TOTAL','PAGE','QUERY','COUNTRY','DEVICE'] as IngestDimension[]);
    let rows=0,truncated=false;
    const days=new Set<string>();
    for(const dimension of dimensions){
      const report=await searchAnalytics(token,property,
        {startDate:windows.current28.from,endDate:windows.current28.to,dimensions:DIMENSION_KEYS[dimension]},
        {fetcher:options.fetcher,maxRows:GSC_ROW_CEILING});
      truncated=truncated||report.truncated;
      const records=report.rows.map(row=>toRecord(dimension,row)).filter(record=>/^\d{4}-\d{2}-\d{2}$/.test(record.day));
      for(const record of records)days.add(record.day);
      if(!records.length)continue;
      // One statement per dimension; ON CONFLICT makes a repeated run an update, never a duplicate.
      await db.query(`INSERT INTO seo_search_daily(property,day,dimension,key,clicks,impressions,ctr,position)
        SELECT $1,r.day::date,$2,r.key,r.clicks,r.impressions,r.ctr,r.position
        FROM jsonb_to_recordset($3::jsonb) AS r(day text,key text,clicks integer,impressions integer,ctr double precision,position double precision)
        ON CONFLICT(property,day,dimension,key) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions,
          ctr=excluded.ctr,position=excluded.position,ingested_at=now()`,[property,dimension,JSON.stringify(records)]);
      rows+=records.length;
    }

    let sitemaps=0;
    try{
      const list=await listSitemaps(token,property,options.fetcher??fetch);
      sitemaps=list.length;
      for(const entry of list)
        await db.query(`INSERT INTO seo_sitemap_status(property,path,captured_day,last_submitted,last_downloaded,is_pending,warnings,errors,submitted,indexed)
          VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT(property,path,captured_day) DO UPDATE SET last_submitted=excluded.last_submitted,
            last_downloaded=excluded.last_downloaded,is_pending=excluded.is_pending,warnings=excluded.warnings,
            errors=excluded.errors,submitted=excluded.submitted,indexed=excluded.indexed`,
          [property,entry.path,iso(now),entry.lastSubmitted,entry.lastDownloaded,entry.isPending,entry.warnings,entry.errors,entry.submitted,entry.indexed]);
    }catch{/* Sitemap metadata is a bonus; losing it must not fail a good performance ingest. */}

    return await finish('CONNECTED',{days:days.size,rows,truncated,sitemaps,from:windows.current28.from,to:windows.current28.to});
  }catch(error){
    const code=error instanceof GscApiError?error.code:'API_ERROR';
    const message=error instanceof GscApiError?error.message:'Search Console request failed';
    return await finish(code as GscState,{},message);
  }
}
