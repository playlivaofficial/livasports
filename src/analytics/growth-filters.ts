import {ACQUISITION_BUCKETS,DAY,weekStart,type AcquisitionBucket,type GrowthFilters} from './growth-report';
import {PAGE_TYPES} from './taxonomy';

const one=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
/** A YYYY-MM-DD day in São Paulo (UTC−03:00) as its UTC instant. */
const localDay=(value:string)=>new Date(`${value}T03:00:00.000Z`);
export const toLocalDay=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const MAX_RANGE_DAYS=92;

export interface ParsedGrowthQuery {filters:GrowthFilters;preset:'7d'|'14d'|'30d'|'custom';week:Date;}
/**
 * Owner dashboard filters from GET parameters. Anything outside the allowlist is dropped; ranges are
 * whole São Paulo days, capped at 92 days so a request can never scan unbounded history.
 */
export function parseGrowthQuery(query:Record<string,string|string[]|undefined>,now=new Date()):ParsedGrowthQuery{
  const range=one(query.range),fromRaw=one(query.from),toRaw=one(query.to);
  let preset:ParsedGrowthQuery['preset']=range==='14d'||range==='30d'?range:'7d';
  let from:Date,to:Date;
  if(fromRaw&&toRaw&&DATE.test(fromRaw)&&DATE.test(toRaw)&&localDay(fromRaw)<=localDay(toRaw)){
    preset='custom';from=localDay(fromRaw);to=new Date(Math.min(localDay(toRaw).getTime()+DAY,now.getTime()));
    if(to.getTime()-from.getTime()>MAX_RANGE_DAYS*DAY)from=new Date(to.getTime()-MAX_RANGE_DAYS*DAY);
    if(to<=from)to=new Date(from.getTime()+DAY);
  }else{to=now;from=new Date(now.getTime()-(preset==='30d'?30:preset==='14d'?14:7)*DAY);}
  const locale=one(query.locale),geo=one(query.geo),source=one(query.source),competition=one(query.competition),team=one(query.team),pageType=one(query.pageType),week=one(query.week);
  return {preset,week:week&&DATE.test(week)?weekStart(localDay(week)):weekStart(now),filters:{from,to,
    locale:locale==='br'||locale==='mx'||locale==='co'||locale==='pe'||locale==='en'?locale:undefined,geo:geo==='BR'||geo==='MX'||geo==='CO'||geo==='PE'||geo==='ROW'?geo:undefined,
    source:(ACQUISITION_BUCKETS as readonly string[]).includes(source??'')?source as AcquisitionBucket:undefined,
    competition:competition&&/^[a-z0-9-]{2,64}$/.test(competition)?competition:undefined,team:team&&/^[a-f0-9]{16}$/.test(team)?team:undefined,
    pageType:(PAGE_TYPES as readonly string[]).includes(pageType??'')?pageType:undefined}};
}
/** Query string that reproduces the current filters (for links, CSV export and period presets). */
export function growthQueryString(parsed:ParsedGrowthQuery,over:Record<string,string|undefined>={}){
  const f=parsed.filters,params=new URLSearchParams();
  const base:Record<string,string|undefined>=parsed.preset==='custom'?{from:toLocalDay(f.from),to:toLocalDay(new Date(f.to.getTime()-1))}:{range:parsed.preset};
  for(const [key,value] of Object.entries({...base,locale:f.locale,geo:f.geo,source:f.source,competition:f.competition,team:f.team,pageType:f.pageType,...over}))if(value)params.set(key,value);
  return params.toString();
}
/** The non-date filters, for views (the weekly scorecard) that choose their own date range. */
export function withoutRange(filters:GrowthFilters):Omit<GrowthFilters,'from'|'to'>{
  return {locale:filters.locale,geo:filters.geo,source:filters.source,competition:filters.competition,team:filters.team,pageType:filters.pageType};
}
