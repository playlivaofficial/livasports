import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {searchAnalytics,GscApiError} from './gsc-client';
import {aggregate,collapse,type SearchRow,type Totals} from './intelligence';

export const PAGE_DIMENSIONS=['QUERY','COUNTRY','DEVICE'] as const;
export type PageDimension=typeof PAGE_DIMENSIONS[number];
/** Three bounded, read-only Google requests at current site volume. Never called by a public route. */
export async function ingestPageBreakdowns(db:QueryExecutor,token:string,property:string,from:string,to:string,fetcher:typeof fetch=fetch){
  const outcomes=[];
  for(const dimension of PAGE_DIMENSIONS){
    try{
      const result=await searchAnalytics(token,property,{startDate:from,endDate:to,
        dimensions:['date','page',dimension.toLowerCase()]},{fetcher,maxRows:25_000});
      // A capped response must not replace a previously complete report or masquerade as complete.
      if(!result.truncated){
        const records=result.rows.map(row=>({day:row.keys[0],page:row.keys[1],key:row.keys[2],
          clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position}))
          .filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&row.page?.startsWith('https://livasports.com/')&&typeof row.key==='string');
        if(result.rows.some(row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.keys[0])||typeof row.keys[1]!=='string'||typeof row.keys[2]!=='string'))
          throw new GscApiError('API_ERROR',0,'Search Analytics returned malformed page rows');
        // Atomic refresh includes removal of rows Google has revised away, scoped only to this report.
        await db.query(`WITH records AS (
          SELECT * FROM jsonb_to_recordset($5::jsonb) AS r(day text,page text,key text,clicks integer,impressions integer,ctr double precision,position double precision)
          ), removed AS (DELETE FROM seo_page_breakdowns b WHERE property=$1 AND dimension=$2
          AND day BETWEEN $3::date AND $4::date AND NOT EXISTS(SELECT 1 FROM records r WHERE r.day::date=b.day AND r.page=b.page AND r.key=b.key) RETURNING 1)
          INSERT INTO seo_page_breakdowns(property,day,page,dimension,key,clicks,impressions,ctr,position)
          SELECT $1,r.day::date,r.page,$2,r.key,r.clicks,r.impressions,r.ctr,r.position
          FROM records r WHERE true ON CONFLICT(property,day,page,dimension,key) DO UPDATE SET
            clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,position=excluded.position,ingested_at=now()`,
          [property,dimension,from,to,JSON.stringify(records)]);
      }
      const state=result.truncated?'TRUNCATED':'SUCCEEDED';
      await db.query(`INSERT INTO seo_breakdown_syncs(property,dimension,from_day,to_day,state,row_count) VALUES($1,$2,$3,$4,$5,$6)`,
        [property,dimension,from,to,state,result.rows.length]);
      outcomes.push({dimension,state,rows:result.rows.length});
    }catch(error){
      const code=error instanceof GscApiError?error.code:'BREAKDOWN_SYNC_FAILED';
      await db.query(`INSERT INTO seo_breakdown_syncs(property,dimension,from_day,to_day,state,error_code) VALUES($1,$2,$3,$4,'FAILED',$5)`,
        [property,dimension,from,to,code]);
      outcomes.push({dimension,state:'FAILED',rows:0});
      if(error instanceof GscApiError&&['AUTH_ERROR','PROPERTY_DENIED'].includes(error.code))break;
    }
  }
  return outcomes;
}

export interface PageMeasurement {
  from:string;to:string;totals:Totals|null;brazil:Totals|null;mobile:Totals|null;
  topQueries:SearchRow[];countries:SearchRow[];devices:SearchRow[];
  complete:boolean;breakdownsComplete:boolean;
}
const metrics=(row:Record<string,unknown>):SearchRow=>({key:String(row.key),clicks:Number(row.clicks),impressions:Number(row.impressions),ctr:Number(row.ctr),position:Number(row.position)});

/** Independent aggregates: query privacy suppression must never reduce page totals or Brazil/mobile counts. */
export async function measurePage(db:QueryExecutor,property:string,page:string,from:string,to:string):Promise<PageMeasurement>{
  const [totals,breakdowns,coverage,baseSync]=await Promise.all([
    db.query(`SELECT key,clicks,impressions,ctr,position FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND key=$2 AND day BETWEEN $3 AND $4`,[property,page,from,to]),
    db.query(`SELECT dimension,key,clicks,impressions,ctr,position FROM seo_page_breakdowns WHERE property=$1 AND page=$2 AND day BETWEEN $3 AND $4`,[property,page,from,to]),
    db.query(`SELECT dim AS dimension,CASE WHEN NOT EXISTS(
      SELECT 1 FROM generate_series($2::date,$3::date,interval '1 day') day WHERE NOT EXISTS(
        SELECT 1 FROM seo_breakdown_syncs s WHERE s.property=$1 AND s.dimension=dim AND s.state='SUCCEEDED'
          AND day::date BETWEEN s.from_day AND s.to_day)) THEN 'SUCCEEDED' ELSE 'INCOMPLETE' END AS state
      FROM unnest(ARRAY['QUERY','COUNTRY','DEVICE']) dim`,[property,from,to]),
    db.query(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM generate_series($2::date,$3::date,interval '1 day') day
      WHERE NOT EXISTS(SELECT 1 FROM seo_gsc_syncs s WHERE s.property=$1 AND s.state='CONNECTED' AND NOT s.truncated
        AND s.finished_at IS NOT NULL AND day::date BETWEEN s.from_day AND s.to_day))
      THEN 'CONNECTED' ELSE 'INCOMPLETE' END AS state,false AS truncated`,[property,from,to]),
  ]);
  const complete=baseSync.rows[0]?.state==='CONNECTED'&&baseSync.rows[0]?.truncated===false;
  const has=(dimension:PageDimension)=>coverage.rows.some(r=>r.dimension===dimension&&r.state==='SUCCEEDED');
  const rows=(dimension:PageDimension)=>collapse(breakdowns.rows.filter(r=>r.dimension===dimension).map(metrics)).sort((a,b)=>b.impressions-a.impressions);
  const countries=rows('COUNTRY'),devices=rows('DEVICE');
  return {from,to,complete,breakdownsComplete:PAGE_DIMENSIONS.every(has),
    totals:complete?aggregate(totals.rows.map(metrics)):null,
    brazil:has('COUNTRY')&&countries.some(r=>r.key.toLowerCase()==='bra')?aggregate(countries.filter(r=>r.key.toLowerCase()==='bra')):null,
    mobile:has('DEVICE')&&devices.some(r=>r.key.toUpperCase()==='MOBILE')?aggregate(devices.filter(r=>r.key.toUpperCase()==='MOBILE')):null,
    topQueries:has('QUERY')?rows('QUERY').slice(0,5):[],countries,devices};
}
