import {CORE_GEOS,geoProfile,type CoreGeo} from '@/config/geo';
import {CORE_GSC_COUNTRIES,aggregate,collapse,type SearchRow,type Totals} from './intelligence';
import {gscWindows} from './gsc-ingest';
import type {QueryExecutor} from '@/database/client';

type Daily=SearchRow&{day:string;dimension:string;page?:string};
type Coverage={from_day:string;to_day:string;dimension?:string};
export interface GeoSearchWindow {
  days:7|14|28;from:string;to:string;complete:boolean;observedDays:number;
  visitorCountry:Totals|null;localeIntent:Totals|null;localPagesInCountry:Totals|null;
  mobile:Totals|null;topQueries:SearchRow[];topPages:SearchRow[];previousLocaleIntent:Totals|null;
}
export interface GeoSearchBaseline {geo:CoreGeo;locale:string;countryCode:string;windows:GeoSearchWindow[];}
const belongs=(url:string,locale:string)=>{try{const u=new URL(url);return u.origin==='https://livasports.com'&&(u.pathname===`/${locale}`||u.pathname.startsWith(`/${locale}/`));}catch{return false;}};
const covered=(reports:Coverage[],from:string,to:string)=>{
  for(let day=Date.parse(from);day<=Date.parse(to);day+=86400000){const value=new Date(day).toISOString().slice(0,10);if(!reports.some(r=>r.from_day<=value&&r.to_day>=value))return false;}
  return true;
};
/** Independent Google dimensions. A regional path never substitutes for searcher country. */
export function buildGeoSearchBaselines(daily:Daily[],details:Daily[],syncs:Coverage[],breakdowns:Coverage[],now=new Date()):GeoSearchBaseline[]{
 const to=gscWindows(now).latestComplete;
 return CORE_GEOS.map(geo=>{
  const locale=geoProfile(geo).locale,countryCode=CORE_GSC_COUNTRIES[geo];
  return {geo,locale,countryCode,windows:([7,14,28] as const).map(days=>{
   const from=new Date(Date.parse(to)-(days-1)*86400000).toISOString().slice(0,10),previousTo=new Date(Date.parse(from)-86400000).toISOString().slice(0,10),previousFrom=new Date(Date.parse(from)-days*86400000).toISOString().slice(0,10);
   const complete=covered(syncs,from,to),base=daily.filter(r=>r.day>=from&&r.day<=to),joint=details.filter(r=>r.day>=from&&r.day<=to&&belongs(r.page??'',locale));
   const pageRows=base.filter(r=>r.dimension==='PAGE'&&belongs(r.key,locale)),countryRows=base.filter(r=>r.dimension==='COUNTRY'&&r.key.toLowerCase()===countryCode);
   const dimReady=(dim:string)=>complete&&covered(breakdowns.filter(r=>r.dimension===dim),from,to);
   const safe=(rows:Daily[],ready=complete)=>ready&&rows.length?aggregate(rows):null;
   const queryRows=dimReady('QUERY')?joint.filter(r=>r.dimension==='QUERY'):[];
   const previous=daily.filter(r=>r.dimension==='PAGE'&&r.day>=previousFrom&&r.day<=previousTo&&belongs(r.key,locale));
   return {days,from,to,complete,observedDays:new Set(pageRows.map(r=>r.day)).size,
    visitorCountry:safe(countryRows),localeIntent:safe(pageRows),
    localPagesInCountry:safe(joint.filter(r=>r.dimension==='COUNTRY'&&r.key.toLowerCase()===countryCode),dimReady('COUNTRY')),
    mobile:safe(joint.filter(r=>r.dimension==='DEVICE'&&r.key.toUpperCase()==='MOBILE'),dimReady('DEVICE')),
    topQueries:collapse(queryRows).sort((a,b)=>b.impressions-a.impressions).slice(0,5),
    topPages:complete?collapse(pageRows).sort((a,b)=>b.impressions-a.impressions).slice(0,5):[],
    previousLocaleIntent:safe(previous,covered(syncs,previousFrom,previousTo))};
  })};
 });
}
/** Four bounded bulk reads, owner-only. Does not call Google or sports providers. */
export async function readGeoSearchBaselines(db:QueryExecutor,property:string,now=new Date()){
 const w=gscWindows(now),values=[property,w.previous28.from,w.current28.to];
 const [daily,details,syncs,breakdowns]=await Promise.all([
  db.query(`SELECT day::text,dimension,key,clicks,impressions,ctr,position FROM seo_search_daily WHERE property=$1 AND day BETWEEN $2 AND $3 AND dimension IN('TOTAL','PAGE','COUNTRY')`,values),
  db.query(`SELECT day::text,page,dimension,key,clicks,impressions,ctr,position FROM seo_page_breakdowns WHERE property=$1 AND day BETWEEN $2 AND $3 AND page ~ '^https://livasports.com/(mx|co|pe)(/|[?]|$)'`,values),
  db.query(`SELECT from_day::text,to_day::text FROM seo_gsc_syncs WHERE property=$1 AND state='CONNECTED' AND NOT truncated AND finished_at IS NOT NULL AND to_day>=$2`,[property,w.previous28.from]),
  db.query(`SELECT dimension,from_day::text,to_day::text FROM seo_breakdown_syncs WHERE property=$1 AND state='SUCCEEDED' AND to_day>=$2`,[property,w.previous28.from]),
 ]);
 const metrics=(rows:Record<string,unknown>[])=>rows.map(r=>({...r,day:String(r.day),key:String(r.key),dimension:String(r.dimension),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)})) as Daily[];
 return buildGeoSearchBaselines(metrics(daily.rows),metrics(details.rows),syncs.rows as Coverage[],breakdowns.rows as Coverage[],now);
}
