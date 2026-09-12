export const SCHEDULER_BOOKMAKERS=['betano.bet.br','betsson'] as const;
export interface RefreshTarget {
  bookmaker:string;tournamentId:string;fixtures:Array<{id:string;kickoff:string;status:string}>;
  publicEligible:boolean;hasUsefulCoverage:boolean;lastSuccessAt:string|null;retryAfter:string|null;
}
export type RefreshTier='FAR_FUTURE'|'WITHIN_48H'|'WITHIN_12H'|'WITHIN_2H'|'FINAL_PREGAME'|'NO_USEFUL_COVERAGE'|'GEO_GATED'|'NO_UPCOMING';
export function planTarget(target:RefreshTarget,activeFeeds:number,now=new Date()){
  const upcoming=target.fixtures.filter(f=>f.status==='SCHEDULED'&&Number.isFinite(Date.parse(f.kickoff))&&Date.parse(f.kickoff)>now.getTime());
  const hours=upcoming.length?Math.min(...upcoming.map(f=>Date.parse(f.kickoff)-now.getTime()))/3600000:Infinity;
  const tier:RefreshTier=!upcoming.length?'NO_UPCOMING':!target.publicEligible?'GEO_GATED':!target.hasUsefulCoverage?'NO_USEFUL_COVERAGE':
    hours<=0.25?'FINAL_PREGAME':hours<=2?'WITHIN_2H':hours<=12?'WITHIN_12H':hours<=48?'WITHIN_48H':'FAR_FUTURE';
  // Shared one-book batch every 15m is <=2,976 calls/31d. Two public feeds use 30m (same cost).
  // Never extend the independent 15-minute public expiry to match a budget-limited cadence.
  const intervalMinutes=tier==='NO_UPCOMING'?null:['GEO_GATED','NO_USEFUL_COVERAGE','FAR_FUTURE'].includes(tier)?1440:
    tier==='WITHIN_48H'?120:tier==='WITHIN_12H'?60:activeFeeds>1?30:15;
  const next=intervalMinutes===null?null:Math.max(target.lastSuccessAt?Date.parse(target.lastSuccessAt)+intervalMinutes*60000:0,target.retryAfter?Date.parse(target.retryAfter):0);
  return {bookmaker:target.bookmaker,tournamentId:target.tournamentId,tier,intervalMinutes,fixtures:upcoming.length,
    nearestKickoff:upcoming.length?new Date(now.getTime()+hours*3600000).toISOString():null,
    due:next!==null&&Number.isFinite(next)&&next<=now.getTime(),nextDueAt:next===null?null:new Date(Math.max(now.getTime(),next)).toISOString()};
}
export function planScheduler(targets:RefreshTarget[],now=new Date()){
  const activeFeeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const targetsPlan=targets.map(t=>planTarget(t,activeFeeds,now));
  const batches=SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>{
    const due=targetsPlan.filter(t=>t.bookmaker===bookmaker&&t.due).sort((a,b)=>Date.parse(a.nearestKickoff!)-Date.parse(b.nearestKickoff!));
    return due.length?[{bookmaker,tournamentIds:due.map(t=>t.tournamentId),fixtures:due.reduce((n,t)=>n+t.fixtures,0)}]:[];
  });
  return {at:now.toISOString(),targets:targetsPlan,batches,maximumBillableRequests:batches.length?Math.min(4,batches.length*2):0,
    nextDueAt:targetsPlan.map(t=>t.nextDueAt).filter((s):s is string=>s!==null).sort()[0]??null};
}
