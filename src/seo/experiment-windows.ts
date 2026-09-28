import type {Totals} from './intelligence';

export const OBSERVATION_DAYS=[7,14,28] as const;
export const addSearchDays=(day:string,n:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+n*86_400_000).toISOString().slice(0,10);
/** GSC reports dates in Pacific time, not the visitor's timezone or the server's UTC date. */
export function firstFullSearchDay(changedAt:Date){
  return addSearchDays(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(changedAt),1);
}
export function observationWindow(start:string,days:7|14|28){return {from:start,to:addSearchDays(start,days-1),days};}
export function observationAssessment(baseline:Totals|null,current:Totals|null,complete:boolean){
  if(!complete||!current)return 'AWAITING_COMPLETE_WINDOW' as const;
  if(!baseline||baseline.impressions<100||current.impressions<100||baseline.clicks+current.clicks<10)return 'INSUFFICIENT_DATA' as const;
  // Not a randomized test. Even a large directional movement is not evidence of causation.
  return 'DESCRIPTIVE_ONLY' as const;
}
export function descriptiveDelta(before:Totals,after:Totals){
  return {clicks:after.clicks-before.clicks,impressions:after.impressions-before.impressions,
    ctrPercentagePoints:(after.ctr-before.ctr)*100,position:after.position-before.position};
}
