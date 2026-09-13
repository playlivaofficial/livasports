import {isStableOddsTournament} from '@/providers/oddspapi/tournament-catalog';
import {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST} from '@/providers/oddspapi/request-limits';

export const SCHEDULER_BOOKMAKERS=['betano.bet.br','betsson'] as const;
export const SCHEDULER_TICK_MINUTES=5;
export {MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST};
export interface RefreshTarget {
  bookmaker:string;tournamentId:string;fixtures:Array<{id:string;kickoff:string;status:string}>;
  publicEligible:boolean;hasUsefulCoverage:boolean;lastSuccessAt:string|null;retryAfter:string|null;
  lastError?:string|null;
}
export type RefreshTier='FAR_FUTURE'|'WITHIN_48H'|'WITHIN_12H'|'WITHIN_2H'|'FINAL_PREGAME'|'NO_USEFUL_COVERAGE'|'GEO_GATED'|'NO_UPCOMING';
/** Paid refresh interval for a public pregame target. Null means no upcoming refresh. */
export function cadenceIntervalMinutes(hours:number,activeFeeds:number):number|null {
  if(!Number.isFinite(hours)||hours<=0)return null;
  if(hours>48)return 1440;if(hours>12)return 120;if(hours>2)return 60;return activeFeeds>1?30:15;
}
/** Public current-price lifetime: cadence plus one scheduler tick, never past kickoff (caller caps). */
export function freshnessTtlMs(hours:number,activeFeeds:number):number {
  const interval=cadenceIntervalMinutes(hours,Math.max(1,activeFeeds));
  return interval===null?0:(interval+SCHEDULER_TICK_MINUTES)*60000;
}
export function planTarget(target:RefreshTarget,activeFeeds:number,now=new Date()){
  const upcoming=target.fixtures.filter(f=>f.status==='SCHEDULED'&&Number.isFinite(Date.parse(f.kickoff))&&Date.parse(f.kickoff)>now.getTime());
  const hours=upcoming.length?Math.min(...upcoming.map(f=>Date.parse(f.kickoff)-now.getTime()))/3600000:Infinity;
  const tier:RefreshTier=!upcoming.length?'NO_UPCOMING':!target.publicEligible?'GEO_GATED':!target.hasUsefulCoverage?'NO_USEFUL_COVERAGE':
    hours<=0.25?'FINAL_PREGAME':hours<=2?'WITHIN_2H':hours<=12?'WITHIN_12H':hours<=48?'WITHIN_48H':'FAR_FUTURE';
  // Shared one-book batch every 15m is <=2,976 calls/31d. Two public feeds use 30m (same cost).
  // Public TTL follows this same interval plus one 5-minute tick; kickoff still closes independently.
  const expanded=!isStableOddsTournament(target.tournamentId);
  const intervalMinutes=tier==='NO_UPCOMING'?null:['GEO_GATED','NO_USEFUL_COVERAGE'].includes(tier)||expanded?1440:cadenceIntervalMinutes(hours,activeFeeds);
  const next=intervalMinutes===null?null:Math.max(target.lastSuccessAt?Date.parse(target.lastSuccessAt)+intervalMinutes*60000:0,target.retryAfter?Date.parse(target.retryAfter):0);
  return {bookmaker:target.bookmaker,tournamentId:target.tournamentId,tier,intervalMinutes,fixtures:upcoming.length,
    nearestKickoff:upcoming.length?new Date(now.getTime()+hours*3600000).toISOString():null,
    due:next!==null&&Number.isFinite(next)&&next<=now.getTime(),nextDueAt:next===null?null:new Date(Math.max(now.getTime(),next)).toISOString()};
}
function chunkIds(ids:readonly string[],size:number):string[][]{
  const batches:string[][]=[];
  for(let i=0;i<ids.length;i+=size)batches.push(ids.slice(i,i+size));
  return batches;
}
/** Stable four stay in their known-working batch. Candidates stay singleton so a 400 cannot stale siblings. */
export function splitProviderBatches(due:readonly RefreshTarget[]):string[][]{
  const stable=due.filter(t=>isStableOddsTournament(t.tournamentId)).map(t=>t.tournamentId);
  const expanded=due.filter(t=>!isStableOddsTournament(t.tournamentId));
  return [
    ...chunkIds(stable,MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST),
    ...expanded.map(t=>[t.tournamentId]),
  ].filter(batch=>batch.length>0);
}
export function planScheduler(targets:RefreshTarget[],now=new Date()){
  const activeFeeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const targetsPlan=targets.map(t=>planTarget(t,activeFeeds,now));
  const batches=SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>{
    const due=targetsPlan.filter(t=>t.bookmaker===bookmaker&&t.due).sort((a,b)=>Date.parse(a.nearestKickoff!)-Date.parse(b.nearestKickoff!));
    if(!due.length)return [];
    const rows=due.map(item=>targets.find(t=>t.bookmaker===bookmaker&&t.tournamentId===item.tournamentId)!);
    const split=splitProviderBatches(rows);
    const stable=split.filter(ids=>ids.every(isStableOddsTournament));
    const expanded=split.filter(ids=>ids.some(id=>!isStableOddsTournament(id)));
    const selected=[...stable.slice(0,1),...expanded.slice(0,1)];
    return selected.map(tournamentIds=>({bookmaker,tournamentIds,fixtures:due.filter(t=>tournamentIds.includes(t.tournamentId)).reduce((n,t)=>n+t.fixtures,0)}));
  });
  return {at:now.toISOString(),targets:targetsPlan,batches,maximumBillableRequests:batches.length,
    nextDueAt:targetsPlan.map(t=>t.nextDueAt).filter((s):s is string=>s!==null).sort()[0]??null};
}
