import type {CanonicalOddsFixture} from './types';
export interface OddsRefreshPlan {due:boolean;intervalMinutes:number|null;reason:string;competitions:string[];maximumRequests:number;}
/** Scheduler activation is external; this pure policy performs no IO or upstream calls. */
export function planOddsRefresh(fixtures:readonly CanonicalOddsFixture[],lastSuccessAt:string|null,now=new Date()):OddsRefreshPlan{
  const upcoming=fixtures.filter(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now.getTime());
  const competitions=[...new Set(upcoming.map(f=>f.competition))];
  if(!upcoming.length)return {due:false,intervalMinutes:null,reason:'NO_UPCOMING_FIXTURES',competitions,maximumRequests:0};
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour<8)return {due:false,intervalMinutes:null,reason:'OUTSIDE_BR_BUDGET_WINDOW',competitions,maximumRequests:0};
  const nearest=Math.min(...upcoming.map(f=>Date.parse(f.kickoff)-now.getTime()))/3600000;
  const intervalMinutes=nearest<=2?15:nearest<=12?30:nearest<=48?120:1440;
  const age=lastSuccessAt?(now.getTime()-Date.parse(lastSuccessAt))/60000:Infinity;
  const due=age>=intervalMinutes;
  return {due,intervalMinutes,reason:due?'DUE':'RECENT_SHARED_SNAPSHOT',competitions,maximumRequests:due?4:0};
}
