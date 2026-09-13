import {isStableOddsTournament} from '@/providers/oddspapi/tournament-catalog';
import {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST} from '@/providers/oddspapi/request-limits';

export const SCHEDULER_BOOKMAKERS=['betano.bet.br','betsson'] as const;
export const SCHEDULER_TICK_MINUTES=5;
export {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST};
export interface RefreshTarget {
  bookmaker:string;tournamentId:string;fixtures:Array<{id:string;kickoff:string;status:string}>;
  publicEligible:boolean;hasUsefulCoverage:boolean;lastSuccessAt:string|null;retryAfter:string|null;lastError?:string|null;needsCadenceRefresh?:boolean;
}
export interface SchedulerBudget {verified:boolean;routineRemaining?:number;period_end?:Date|string;}
export type RefreshTier='FAR_FUTURE'|'WITHIN_48H'|'WITHIN_12H'|'WITHIN_2H'|'FINAL_PREGAME'|'NO_USEFUL_COVERAGE'|'GEO_GATED'|'NO_UPCOMING';
/** Requested cadence; the forecast scales intervals to the actual feed/fixture budget. */
export function cadenceIntervalMinutes(hours:number,activeFeeds:number):number|null {
  if(!Number.isFinite(hours)||hours<=0)return null;
  if(hours>168)return 720;
  if(hours>48)return 360;
  if(hours>12)return 120;
  if(hours>2)return 60;
  return activeFeeds>1?30:15;
}
export function scaledInterval(minutes:number,scale=1):number {
  return Math.ceil(minutes*Math.max(1,scale)/SCHEDULER_TICK_MINUTES)*SCHEDULER_TICK_MINUTES;
}
/** Freeze at observation. Approaching kickoff must not retroactively shorten a quote's lifetime. */
export function freshnessTtlMs(hours:number,activeFeeds:number,scale=1):number {
  const interval=cadenceIntervalMinutes(hours,Math.max(1,activeFeeds));
  return interval===null?0:(scaledInterval(interval,scale)+SCHEDULER_TICK_MINUTES)*60000;
}
export function planTarget(target:RefreshTarget,activeFeeds:number,now=new Date(),scale=1){
  const upcoming=target.fixtures.filter(f=>f.status==='SCHEDULED'&&Number.isFinite(Date.parse(f.kickoff))&&Date.parse(f.kickoff)>now.getTime());
  const hours=upcoming.length?Math.min(...upcoming.map(f=>Date.parse(f.kickoff)-now.getTime()))/3600000:Infinity;
  const tier:RefreshTier=!upcoming.length?'NO_UPCOMING':!target.publicEligible?'GEO_GATED':
    hours<=0.25?'FINAL_PREGAME':hours<=2?'WITHIN_2H':hours<=12?'WITHIN_12H':hours<=48?'WITHIN_48H':'FAR_FUTURE';
  // A feed without prices still needs discovery before kickoff. Coverage is never an eligibility gate.
  const base=tier==='NO_UPCOMING'?null:tier==='GEO_GATED'?1440:cadenceIntervalMinutes(hours,activeFeeds);
  const intervalMinutes=base===null?null:scaledInterval(base,scale);
  const dueAt=intervalMinutes===null?null:Math.max(target.lastSuccessAt&&!target.needsCadenceRefresh?Date.parse(target.lastSuccessAt)+intervalMinutes*60000:0,target.retryAfter?Date.parse(target.retryAfter):0);
  return {bookmaker:target.bookmaker,tournamentId:target.tournamentId,tier,intervalMinutes,fixtures:upcoming.length,
    nearestKickoff:upcoming.length?new Date(now.getTime()+hours*3600000).toISOString():null,
    due:dueAt!==null&&Number.isFinite(dueAt)&&dueAt<=now.getTime(),
    urgency:dueAt===null?0:(now.getTime()-dueAt)/Math.max(1,(intervalMinutes??1)*60000),
    nextDueAt:dueAt===null?null:new Date(Math.max(now.getTime(),dueAt)).toISOString()};
}
/** Original verified four share requests; each expanded tournament remains isolated. */
export function splitProviderBatches(due:readonly RefreshTarget[]):string[][]{
  const stable=due.filter(t=>isStableOddsTournament(t.tournamentId)).map(t=>t.tournamentId);
  const batches:string[][]=[];
  for(let i=0;i<stable.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)batches.push(stable.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST));
  return [...batches,...due.filter(t=>!isStableOddsTournament(t.tournamentId)).map(t=>[t.tournamentId])];
}
/** Simulate the five-minute ticker, including singleton throughput, stable batches and backlog. */
export function forecastRequests(targets:RefreshTarget[],now:Date,days:number,scale:number):number {
  const feeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const rows=targets.map(t=>({...t,kicks:t.fixtures.filter(f=>f.status==='SCHEDULED').map(f=>Date.parse(f.kickoff)).filter(Number.isFinite).sort((a,b)=>a-b),
    last:t.lastSuccessAt&&!t.needsCadenceRefresh?Date.parse(t.lastSuccessAt):0,retry:t.retryAfter?Date.parse(t.retryAfter):0}));
  let count=0;
  for(let at=now.getTime();at<now.getTime()+days*86400000;at+=SCHEDULER_TICK_MINUTES*60000){
    for(const bookmaker of SCHEDULER_BOOKMAKERS){
      const planned=rows.filter(r=>r.bookmaker===bookmaker).flatMap(r=>{
        const kick=r.kicks.find(k=>k>at);if(!kick)return [];
        const base=r.publicEligible?cadenceIntervalMinutes((kick-at)/3600000,feeds)!:1440;
        const interval=scaledInterval(base,scale)*60000;
        return [{r,kick,dueAt:Math.max(r.last+interval,r.retry),interval}];
      });
      const due=planned.filter(p=>p.dueAt<=at).sort((a,b)=>(at-b.dueAt)/b.interval-(at-a.dueAt)/a.interval||a.kick-b.kick);
      if(due.some(p=>isStableOddsTournament(p.r.tournamentId))){
        const stable=planned.filter(p=>isStableOddsTournament(p.r.tournamentId)&&p.r.retry<=at);
        count+=Math.ceil(stable.length/MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST);stable.forEach(p=>p.r.last=at);
      }
      const expanded=due.find(p=>!isStableOddsTournament(p.r.tournamentId));
      if(expanded){count++;expanded.r.last=at;}
    }
  }
  return count;
}
export function budgetCadence(targets:RefreshTarget[],now:Date,budget?:SchedulerBudget){
  const remainingDays=budget?.period_end?Math.max(0.01,(new Date(budget.period_end).getTime()-now.getTime())/86400000):31;
  // 10% headroom for retries. The ledger independently checks period quota and a paced daily ceiling.
  const dailyAllowance=budget&&!budget.verified?0:Math.max(0,Math.min(216,Math.floor((budget?.routineRemaining??4000)/remainingDays*0.9)));
  const horizonDays=Math.min(7,remainingDays);
  const ceiling=Math.floor(dailyAllowance*horizonDays);
  let scale=1;let forecast=forecastRequests(targets,now,horizonDays,scale);
  while(forecast>ceiling&&scale<128){scale=Math.round(scale*1.25*100)/100;forecast=forecastRequests(targets,now,horizonDays,scale);}
  return {scale,horizonDays,dailyAllowance,projectedRequests:forecast,projectedDailyRequests:Math.ceil(forecast/horizonDays),
    activeFeeds:targets.filter(t=>t.publicEligible&&t.fixtures.some(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now.getTime())).length,
    budgetAvailable:dailyAllowance>0&&forecast<=ceiling};
}
export function planScheduler(targets:RefreshTarget[],now=new Date(),budget?:SchedulerBudget){
  const cadence=budgetCadence(targets,now,budget);
  const activeFeeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const targetsPlan=targets.map(t=>planTarget(t,activeFeeds,now,cadence.scale));
  const batches=cadence.budgetAvailable?SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>{
    const eligible=targetsPlan.filter(t=>t.bookmaker===bookmaker&&t.intervalMinutes!==null);
    const due=eligible.filter(t=>t.due).sort((a,b)=>b.urgency-a.urgency||Date.parse(a.nearestKickoff!)-Date.parse(b.nearestKickoff!));
    if(!due.length)return [];
    const stable=due.some(t=>isStableOddsTournament(t.tournamentId))?eligible.filter(t=>{
      const retry=targets.find(r=>r.bookmaker===bookmaker&&r.tournamentId===t.tournamentId)?.retryAfter;
      return isStableOddsTournament(t.tournamentId)&&(!retry||Date.parse(retry)<=now.getTime());
    }):[];
    const expanded=due.filter(t=>!isStableOddsTournament(t.tournamentId)).slice(0,1);
    const selected=[...(stable.length?[stable.map(t=>t.tournamentId)]:[]),...expanded.map(t=>[t.tournamentId])];
    return selected.map(tournamentIds=>({bookmaker,tournamentIds,fixtures:eligible.filter(t=>tournamentIds.includes(t.tournamentId)).reduce((n,t)=>n+t.fixtures,0)}));
  }).sort((a,b)=>Number(!a.tournamentIds.every(isStableOddsTournament))-Number(!b.tournamentIds.every(isStableOddsTournament))):[];
  return {at:now.toISOString(),cadence,targets:targetsPlan,batches,maximumBillableRequests:batches.length,
    nextDueAt:targetsPlan.map(t=>t.nextDueAt).filter((s):s is string=>s!==null).sort()[0]??null};
}
