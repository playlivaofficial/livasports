import type {CoreGeo} from '@/config/geo';

export const DEMAND_POLICY={version:'GEO_DEMAND_1',windows:[7,14,28],minSessions:30,minDays:4,minFixtures:3,maxAdjustment:.12,maxWeeklyStep:.03} as const;
export interface BettingWindow {days:7|14|28;sessions:number;observedDays:number;fixtures:number;views:number;markets:number;selections:number;slipAdds:number;comparisons:number;bookmakerInteractions:number;outbound:number;}
export interface BettingEvidence {geo:CoreGeo;windows:BettingWindow[];strength:number;reason:string;sufficient:boolean;}
export interface DemandProfile {competition:string;seed:number;previous:number;adjustment:number;proposed:number;effective:number;reason:string;evidence:BettingEvidence;}
export const emptyWindow=(days:7|14|28):BettingWindow=>({days,sessions:0,observedDays:0,fixtures:0,views:0,markets:0,selections:0,slipAdds:0,comparisons:0,bookmakerInteractions:0,outbound:0});
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:0));
const round=(v:number)=>Math.round(v*1000)/1000;
/** Unique-session action rates, shrunk toward zero. Impressions never enter bettor demand. */
export function bettingEvidence(geo:CoreGeo,windows:BettingWindow[]):BettingEvidence{
  const sufficient=windows.some(w=>w.sessions>=DEMAND_POLICY.minSessions&&w.observedDays>=DEMAND_POLICY.minDays);
  if(!sufficient)return {geo,windows,strength:0,sufficient:false,reason:'Datos insuficientes: mínimo 30 sesiones humanas y 4 días observados; no se cambia la demanda'};
  const weighted=windows.map(w=>{
    if(w.sessions<DEMAND_POLICY.minSessions||w.observedDays<DEMAND_POLICY.minDays)return {value:0,weight:0};
    const intent=(w.markets*.05+w.selections*.18+w.slipAdds*.22+w.comparisons*.25+w.bookmakerInteractions*.1+w.outbound*.2)/Math.max(1,w.sessions);
    return {value:clamp(intent)*w.sessions/(w.sessions+40),weight:w.days===28?.5:w.days===14?.3:.2};
  });
  const denominator=weighted.reduce((s,w)=>s+w.weight,0),strength=round(weighted.reduce((s,w)=>s+w.value*w.weight,0)/Math.max(.1,denominator));
  return {geo,windows,strength,sufficient:true,reason:`Intención ${geo}: acciones por sesión humana, ventanas 7/14/28 días; suavizado y sin tráfico QA/propietario`};
}
/** Absolute, weekly, non-compounding learning. At least three fixtures prevent one viral match changing a league. */
export function demandProfile(competition:string,seed:number,previous:number,evidence:BettingEvidence):DemandProfile{
  const long=evidence.windows.find(w=>w.days===28),eligible=evidence.sufficient&&(long?.fixtures??0)>=DEMAND_POLICY.minFixtures;
  const proposed=eligible?round(clamp((evidence.strength-.18)*.4,-DEMAND_POLICY.maxAdjustment,DEMAND_POLICY.maxAdjustment)):0;
  const old=clamp(previous,-DEMAND_POLICY.maxAdjustment,DEMAND_POLICY.maxAdjustment);
  const adjustment=round(clamp(proposed,old-DEMAND_POLICY.maxWeeklyStep,old+DEMAND_POLICY.maxWeeklyStep));
  return {competition,seed,previous:old,adjustment,proposed,effective:round(clamp(seed+adjustment)),evidence,
    reason:eligible?'Ajuste semanal absoluto; máximo ±0,12 de la base y ±0,03 por semana':'Muestra insuficiente o menos de tres partidos: retorno gradual a la base, sin inventar demanda'};
}

export interface SearchEvidence {impressions:number;clicks:number;ctr:number;position:number;days:number;strength:number;status:'insufficient data'|'watch'|'striking distance'|'winner'|'low CTR'|'declining';dimension:'canonical locale path (not visitor country)';}
export function searchEvidence(current:{impressions:number;clicks:number;position:number;days:number},previousClicks=0):SearchEvidence{
  const ctr=current.impressions?current.clicks/current.impressions:0,enough=current.impressions>=50&&current.days>=7;
  const status=!enough?'insufficient data':previousClicks>=5&&current.clicks<previousClicks*.6?'declining':current.position>=4&&current.position<=20?'striking distance':current.position<=3&&current.clicks>=5?'winner':current.position<=10&&ctr<.01?'low CTR':'watch';
  return {...current,ctr,status,strength:enough?(status==='striking distance'?.8:status==='low CTR'?.6:.4):0,dimension:'canonical locale path (not visitor country)'};
}
