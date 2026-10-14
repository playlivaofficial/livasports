import {geoProfile,type CoreGeo} from '@/config/geo';

export const DAILY_GROWTH_VERSION='GEO_HOURLY_SEO_3';
export const GROWTH_CHECK_CRON='17 * * * *';
/** Every hourly check fully ranks the GEO inventory, including the first check of each local day. */
export function growthLocalDay(geo:CoreGeo,now:Date){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:geoProfile(geo).timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextGrowthCheck(now:Date){
 const next=new Date(now);next.setUTCMinutes(17,0,0);if(next<=now)next.setUTCHours(next.getUTCHours()+1);return next.toISOString();
}
