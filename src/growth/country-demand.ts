import type {CoreGeo} from '@/config/geo';
import type {FixtureSignals} from './scoring';

/** Search visibility observed in the searcher's country, never inferred from route language. */
export const COUNTRY_DEMAND_POLICY={version:'COUNTRY_SEARCH_1',weight:18,minCountryImpressions:50,minCountryDays:7,minEntityImpressions:20,minEntityDays:3,maxAgeHours:72,clickWeight:5} as const;
export interface CountrySearchRow {day:string;page:string;impressions:number;clicks:number;competition:string|null;homePublicId:string|null;awayPublicId:string|null;teamPublicId:string|null;}
export interface CountryEntityDemand {key:string;impressions:number;clicks:number;days:number;strength:number;qualified:boolean;}
export interface CountryDemand {
 geo:CoreGeo;countryCode:string;from:string;to:string;observedDays:number;impressions:number;clicks:number;ready:boolean;capturedAt:string|null;
 competitions:CountryEntityDemand[];clubs:CountryEntityDemand[];reason:string;
}
const codes={MX:'mex',CO:'col',PE:'per'} as const;
export const growthCountryCode=(geo:CoreGeo)=>codes[geo];
export function buildCountryDemand(geo:CoreGeo,rows:CountrySearchRow[],window:{from:string;to:string;capturedAt:string|null},now:Date):CountryDemand{
 const valid=rows.filter(r=>r.day>=window.from&&r.day<=window.to&&Number.isFinite(r.impressions)&&r.impressions>=0&&Number.isFinite(r.clicks)&&r.clicks>=0);
 const observedDays=new Set(valid.map(r=>r.day)).size,impressions=valid.reduce((s,r)=>s+r.impressions,0),clicks=valid.reduce((s,r)=>s+r.clicks,0);
 const age=window.capturedAt?(now.getTime()-Date.parse(window.capturedAt))/3600000:Infinity;
 const ready=age>=0&&age<=COUNTRY_DEMAND_POLICY.maxAgeHours&&impressions>=COUNTRY_DEMAND_POLICY.minCountryImpressions&&observedDays>=COUNTRY_DEMAND_POLICY.minCountryDays;
 const entities=(keys:(r:CountrySearchRow)=>Array<string|null>)=>{
  const groups=new Map<string,{impressions:number;clicks:number;days:Set<string>}>();
  for(const r of valid)for(const key of new Set(keys(r).filter((key):key is string=>!!key))){
   const group=groups.get(key)??{impressions:0,clicks:0,days:new Set<string>()};group.impressions+=r.impressions;group.clicks+=r.clicks;group.days.add(r.day);groups.set(key,group);
  }
  const mass=(r:{impressions:number;clicks:number})=>r.impressions+COUNTRY_DEMAND_POLICY.clickWeight*r.clicks;
  const max=Math.max(1,...[...groups.values()].map(mass));
  return [...groups].map(([key,r])=>{const qualified=ready&&r.impressions>=COUNTRY_DEMAND_POLICY.minEntityImpressions&&r.days.size>=COUNTRY_DEMAND_POLICY.minEntityDays;
   return {key,impressions:r.impressions,clicks:r.clicks,days:r.days.size,qualified,strength:qualified?Math.round(Math.log1p(mass(r))/Math.log1p(max)*1000)/1000:0};}).sort((a,b)=>b.strength-a.strength||b.impressions-a.impressions||a.key.localeCompare(b.key));
 };
 return {geo,countryCode:codes[geo],...window,observedDays,impressions,clicks,ready,competitions:entities(r=>[r.competition]),clubs:entities(r=>[r.homePublicId,r.awayPublicId,r.teamPublicId]),
  reason:ready?'GSC COUNTRY × PAGE: país real del buscador; impresiones/clics observados, no volumen total de búsquedas':'GSC por país insuficiente o desactualizado: señal cero; bases editoriales explícitas, sin demanda inventada'};
}
export function fixtureCountryDemand(signals:FixtureSignals,demand:CountryDemand){
 const candidates=[demand.competitions.find(r=>r.key===signals.competitionSlug),...demand.clubs.filter(r=>r.key===signals.home.publicId||r.key===signals.away.publicId)].filter((r):r is CountryEntityDemand=>!!r&&r.qualified);
 const best=candidates.sort((a,b)=>b.strength-a.strength||b.impressions-a.impressions||a.key.localeCompare(b.key))[0];
 return {strength:best?.strength??0,reason:best?`GSC país ${demand.geo} (${demand.countryCode}), ${best.key}: ${best.impressions} impresiones, ${best.clicks} clics, ${best.days} días; máximo de liga/club, sin sumar señales solapadas`:demand.reason+'; sin entidad con muestra suficiente'};
}
