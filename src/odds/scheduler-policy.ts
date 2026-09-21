import {isStableOddsTournament} from '@/providers/oddspapi/tournament-catalog';
import {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST} from '@/providers/oddspapi/request-limits';
import {SOURCE_BOOKMAKER_IDS} from './registry';
import {NORMAL_FORECAST_FRACTION,NORMAL_STOP_FRACTION,quotaPressure} from './quota-policy';

export const SCHEDULER_BOOKMAKERS=SOURCE_BOOKMAKER_IDS;
export const SCHEDULER_TICK_MINUTES=5;
export {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST};
export interface RefreshTarget {
  bookmaker:string;tournamentId:string;fixtures:Array<{id:string;kickoff:string;status:string}>;
  publicEligible:boolean;hasUsefulCoverage:boolean;lastSuccessAt:string|null;retryAfter:string|null;lastError?:string|null;needsCadenceRefresh?:boolean;
  /** P0 incident fields: a target that has succeeded before and is not failing can share a provider request. */
  lastAttemptAt?:string|null;consecutiveFailures?:number;
}
export interface SchedulerBudget {verified:boolean;routineRemaining?:number;period_end?:Date|string;
  /** Ledger view of the rolling 24h SCHEDULED spend and its paced ceiling (P0 incident pacing). */
  rollingDay?:number;dailyCap?:number;}
/** Share of the rolling-day ceiling kept for urgent batches (kickoff within 12h or recovery) so routine refreshes never starve them. */
export const URGENCY_RESERVE_FRACTION=0.2;
export const URGENT_KICKOFF_HOURS=12;
export type RefreshTier='FAR_FUTURE'|'WITHIN_48H'|'WITHIN_12H'|'WITHIN_2H'|'FINAL_PREGAME'|'NO_USEFUL_COVERAGE'|'GEO_GATED'|'NO_UPCOMING';
/** Requested cadence; the forecast scales intervals to the actual feed/fixture budget. */
export function cadenceIntervalMinutes(hours:number,activeFeeds:number):number|null {
  if(!Number.isFinite(hours)||hours<=0)return null;
  if(hours>168)return null;
  if(hours>72)return 720;
  if(hours>24)return 360;
  if(hours>2)return 120;
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
  const upcoming=target.fixtures.filter(f=>f.status==='SCHEDULED'&&Number.isFinite(Date.parse(f.kickoff))&&Date.parse(f.kickoff)>now.getTime()&&Date.parse(f.kickoff)<=now.getTime()+7*86400000);
  const hours=upcoming.length?Math.min(...upcoming.map(f=>Date.parse(f.kickoff)-now.getTime()))/3600000:Infinity;
  const tier:RefreshTier=!upcoming.length?'NO_UPCOMING':!target.publicEligible?'GEO_GATED':
    hours<=0.25?'FINAL_PREGAME':hours<=2?'WITHIN_2H':hours<=12?'WITHIN_12H':hours<=48?'WITHIN_48H':'FAR_FUTURE';
  // A feed without prices still needs discovery before kickoff. Coverage is never an eligibility gate.
  const base=tier==='NO_UPCOMING'?null:tier==='GEO_GATED'?1440:cadenceIntervalMinutes(hours,activeFeeds);
  // Missing near-term coverage gets priority, but must not bypass the shared quota-scaled cadence.
  const recovery=base!==null&&!target.hasUsefulCoverage&&hours<=72;
  const intervalMinutes=base===null?null:scaledInterval(base,scale);
  const dueAt=intervalMinutes===null?null:Math.max(target.lastSuccessAt&&!target.needsCadenceRefresh?Date.parse(target.lastSuccessAt)+intervalMinutes*60000:0,target.retryAfter?Date.parse(target.retryAfter):0);
  return {bookmaker:target.bookmaker,tournamentId:target.tournamentId,tier,intervalMinutes,fixtures:upcoming.length,recovery,
    proven:isProvenTarget(target),
    nearestKickoff:upcoming.length?new Date(now.getTime()+hours*3600000).toISOString():null,
    due:dueAt!==null&&Number.isFinite(dueAt)&&dueAt<=now.getTime(),
    urgency:dueAt===null?0:(now.getTime()-dueAt)/Math.max(1,(intervalMinutes??1)*60000),
    nextDueAt:dueAt===null?null:new Date(Math.max(now.getTime(),dueAt)).toISOString()};
}
/** A target that has a prior success and no recent failure can safely share a request with other proven targets. */
export function isProvenTarget(target:Pick<RefreshTarget,'tournamentId'|'lastSuccessAt'|'consecutiveFailures'>){
  return isStableOddsTournament(target.tournamentId)||(Boolean(target.lastSuccessAt)&&(target.consecutiveFailures??0)===0);
}
/** Unproven (never successful or currently failing) tournaments are probed one per request so a 404 stays isolated. */
export const MAX_UNPROVEN_PROBES_PER_TICK=2;
/** Stable four share one request; proven expanded feeds share requests in fours; unproven ones stay isolated. */
export function splitProviderBatches(due:readonly RefreshTarget[]):string[][]{
  due=[...new Map(due.map(t=>[`${t.bookmaker}:${t.tournamentId}`,t])).values()];
  const chunk=(ids:string[])=>{const out:string[][]=[];for(let i=0;i<ids.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)out.push(ids.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST));return out;};
  const stable=due.filter(t=>isStableOddsTournament(t.tournamentId)).map(t=>t.tournamentId);
  const proven=due.filter(t=>!isStableOddsTournament(t.tournamentId)&&isProvenTarget(t)).map(t=>t.tournamentId);
  const unproven=due.filter(t=>!isStableOddsTournament(t.tournamentId)&&!isProvenTarget(t)).map(t=>[t.tournamentId]);
  return [...chunk(stable),...chunk(proven),...unproven];
}
/** Simulate the five-minute ticker: stable batch, proven feeds in fours, unproven singletons (bounded per tick). */
export function forecastDetail(targets:RefreshTarget[],now:Date,days:number,scale:number){
  targets=[...new Map(targets.map(t=>[`${t.bookmaker}:${t.tournamentId}`,t])).values()];
  const feeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const rows=targets.map(t=>({...t,kicks:t.fixtures.filter(f=>f.status==='SCHEDULED').map(f=>Date.parse(f.kickoff)).filter(Number.isFinite).sort((a,b)=>a-b),
    last:t.lastSuccessAt&&!t.needsCadenceRefresh?Date.parse(t.lastSuccessAt):0,retry:t.retryAfter?Date.parse(t.retryAfter):0,proven:isProvenTarget(t)}));
  let count=0;const byBookmaker:Record<string,number>={},byCompetition:Record<string,number>={},byDay:number[]=Array(Math.ceil(days)).fill(0);
  const record=(bookmaker:string,members:typeof rows,at:number)=>{if(!members.length)return;count++;byBookmaker[bookmaker]=(byBookmaker[bookmaker]??0)+1;byDay[Math.floor((at-now.getTime())/86400000)]++;
    for(const r of members){byCompetition[r.tournamentId]=(byCompetition[r.tournamentId]??0)+1/members.length;r.last=at;r.proven=true;}};
  for(let at=now.getTime();at<now.getTime()+days*86400000;at+=SCHEDULER_TICK_MINUTES*60000){
    for(const bookmaker of SCHEDULER_BOOKMAKERS){
      const planned=rows.filter(r=>r.bookmaker===bookmaker).flatMap(r=>{
        const kick=r.kicks.find(k=>k>at);if(!kick||kick>at+7*86400000)return [];
        const hours=(kick-at)/3600000;
        const base=r.publicEligible?cadenceIntervalMinutes(hours,feeds)!:1440;
        const interval=scaledInterval(base,scale)*60000;
        return [{r,kick,dueAt:Math.max(r.last+interval,r.retry),interval}];
      });
      const due=planned.filter(p=>p.dueAt<=at);
      if(due.some(p=>isStableOddsTournament(p.r.tournamentId))){
        const stable=due.filter(p=>isStableOddsTournament(p.r.tournamentId));
        for(let i=0;i<stable.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)record(bookmaker,stable.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST).map(p=>p.r),at);
      }
      const proven=due.filter(p=>!isStableOddsTournament(p.r.tournamentId)&&p.r.proven);
      for(let i=0;i<proven.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)record(bookmaker,proven.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST).map(p=>p.r),at);
      const unproven=due.filter(p=>!isStableOddsTournament(p.r.tournamentId)&&!p.r.proven).slice(0,MAX_UNPROVEN_PROBES_PER_TICK);
      unproven.forEach(p=>record(bookmaker,[p.r],at));
    }
  }
  return {requests:count,byBookmaker,byCompetition,byDay,peakDailyRequests:Math.max(0,...byDay)};
}
export function forecastRequests(targets:RefreshTarget[],now:Date,days:number,scale:number):number{return forecastDetail(targets,now,days,scale).requests;}
export function budgetCadence(targets:RefreshTarget[],now:Date,budget?:SchedulerBudget){
  const remainingDays=budget?.period_end?Math.max(0.01,(new Date(budget.period_end).getTime()-now.getTime())/86400000):31;
  // Forecast below the paced allowance, including the busiest day, not merely the seven-day average.
  const dailyAllowance=budget&&!budget.verified?0:Math.max(0,Math.min(budget?.dailyCap??Infinity,Math.floor((budget?.routineRemaining??4650)/remainingDays)));
  const horizonDays=Math.min(7,remainingDays);
  const normalDailyTarget=Math.floor(dailyAllowance*NORMAL_FORECAST_FRACTION);
  const ceiling=Math.floor(normalDailyTarget*horizonDays);
  let scale=1;let detail=forecastDetail(targets,now,horizonDays,scale);
  while((detail.requests>ceiling||detail.peakDailyRequests>normalDailyTarget)&&scale<128){scale=Math.round(scale*1.25*100)/100;detail=forecastDetail(targets,now,horizonDays,scale);}
  scale=Math.round(scale*quotaPressure(budget?.rollingDay??0,dailyAllowance).slowdown*100)/100;
  detail=forecastDetail(targets,now,horizonDays,scale);const forecast=detail.requests;
  return {scale,horizonDays,dailyAllowance,projectedRequests:forecast,projectedDailyRequests:Math.ceil(forecast/horizonDays),
    activeFeeds:targets.filter(t=>t.publicEligible&&t.fixtures.some(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now.getTime()&&Date.parse(f.kickoff)<=now.getTime()+7*86400000)).length,
    normalDailyTarget,reservePct:dailyAllowance?Math.round((1-Math.ceil(forecast/horizonDays)/dailyAllowance)*1000)/10:100,
    peakDailyRequests:detail.peakDailyRequests,forecast:detail,
    budgetAvailable:dailyAllowance>0&&forecast<=ceiling&&detail.peakDailyRequests<=normalDailyTarget};
}
export function planScheduler(targets:RefreshTarget[],now=new Date(),budget?:SchedulerBudget){
  targets=[...new Map(targets.map(t=>[`${t.bookmaker}:${t.tournamentId}`,t])).values()];
  const cadence=budgetCadence(targets,now,budget);
  const activeFeeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const targetsPlan=targets.map(t=>planTarget(t,activeFeeds,now,cadence.scale));
  const chunk=(ids:string[])=>{const out:string[][]=[];for(let i=0;i<ids.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)out.push(ids.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST));return out;};
  const planned=cadence.budgetAvailable?SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>{
    const eligible=targetsPlan.filter(t=>t.bookmaker===bookmaker&&t.intervalMinutes!==null);
    // Priority: recovery (near-term feed without coverage) first, then relative lateness, then nearest kickoff.
    const due=eligible.filter(t=>t.due).sort((a,b)=>Number(b.recovery)-Number(a.recovery)||b.urgency-a.urgency||Date.parse(a.nearestKickoff!)-Date.parse(b.nearestKickoff!));
    if(!due.length)return [];
    const retryOk=(t:{tournamentId:string})=>{const retry=targets.find(r=>r.bookmaker===bookmaker&&r.tournamentId===t.tournamentId)?.retryAfter;return !retry||Date.parse(retry)<=now.getTime();};
    const stable=due.filter(t=>isStableOddsTournament(t.tournamentId)&&retryOk(t));
    const proven=due.filter(t=>!isStableOddsTournament(t.tournamentId)&&t.proven);
    const unproven=due.filter(t=>!isStableOddsTournament(t.tournamentId)&&!t.proven).slice(0,MAX_UNPROVEN_PROBES_PER_TICK);
    const selected=[...chunk(stable.map(t=>t.tournamentId)),...chunk(proven.map(t=>t.tournamentId)),...unproven.map(t=>[t.tournamentId])];
    return selected.map(tournamentIds=>{
      const members=eligible.filter(t=>tournamentIds.includes(t.tournamentId));
      const nearestHours=Math.min(...members.map(t=>t.nearestKickoff?(Date.parse(t.nearestKickoff)-now.getTime())/3600000:Infinity));
      return {bookmaker,tournamentIds,fixtures:members.reduce((n,t)=>n+t.fixtures,0),
        urgent:members.some(t=>t.recovery)||nearestHours<=URGENT_KICKOFF_HOURS,nearestHours};
    });
  }).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||(a.urgent&&b.urgent?a.nearestHours-b.nearestHours:0)
    ||Number(!a.tournamentIds.every(isStableOddsTournament))-Number(!b.tournamentIds.every(isStableOddsTournament))):[];
  // Urgent batches lead, but ALL automatic requests stop at 80%; they cannot consume the exception reserve.
  const headroom=budget?.dailyCap!==undefined&&budget.rollingDay!==undefined?Math.max(0,Math.floor(budget.dailyCap*NORMAL_STOP_FRACTION)-budget.rollingDay):null;
  const routineHeadroom=headroom;
  const batches:typeof planned=[];let routineUsed=0;
  for(const batch of planned){
    if(headroom!==null&&batches.length>=headroom)break;
    if(!batch.urgent){if(routineHeadroom!==null&&routineUsed>=routineHeadroom)continue;routineUsed++;}
    batches.push(batch);
  }
  const pacing={rollingDay:budget?.rollingDay??null,dailyCap:budget?.dailyCap??null,headroom,routineHeadroom,
    plannedBatches:planned.length,deferredBatches:planned.length-batches.length,urgentBatches:batches.filter(b=>b.urgent).length};
  return {at:now.toISOString(),cadence,pacing,targets:targetsPlan,batches,maximumBillableRequests:batches.length,
    nextDueAt:targetsPlan.map(t=>t.nextDueAt).filter((s):s is string=>s!==null).sort()[0]??null};
}
