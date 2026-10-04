import {describe,expect,it} from 'vitest';
import {isStableOddsTournament} from '@/providers/oddspapi/tournament-catalog';
import {cadenceIntervalMinutes,expiryDue,forecastDetail,freshnessTtlMs,isProvenTarget,MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST,MAX_UNPROVEN_PROBES_PER_TICK,scaledInterval,SCHEDULER_TICK_MINUTES,type RefreshTarget} from './scheduler-policy';

// Deliberately keep the pre-optimization ticker here as a behavioral oracle.
// Performance changes must not alter request accounting, batch composition,
// kickoff rollover, native expiry rescue, or the promotion of isolated probes.
function referenceForecast(targets:RefreshTarget[],now:Date,days:number,scale:number){
  targets=[...new Map(targets.filter(t=>!t.unsupported&&!t.mappingBlocked).map(t=>[`${t.bookmaker}:${t.tournamentId}`,t])).values()];
  const feeds=new Set(targets.filter(t=>t.publicEligible).map(t=>t.bookmaker)).size;
  const rows=targets.map(t=>({...t,kicks:t.fixtures.filter(f=>f.status==='SCHEDULED').map(f=>Date.parse(f.kickoff)).filter(Number.isFinite).sort((a,b)=>a-b),
    expiry:t.nativeExpiryAt??null,last:(t.lastCheckedAt??t.lastSuccessAt)&&!t.needsCadenceRefresh?Date.parse((t.lastCheckedAt??t.lastSuccessAt)!):0,retry:t.retryAfter?Date.parse(t.retryAfter):0,proven:isProvenTarget(t)}));
  let count=0;const byBookmaker:Record<string,number>={},byCompetition:Record<string,number>={},byDay:number[]=Array(Math.ceil(days)).fill(0);
  const record=(bookmaker:string,members:typeof rows,at:number)=>{if(!members.length)return;count++;byBookmaker[bookmaker]=(byBookmaker[bookmaker]??0)+1;byDay[Math.floor((at-now.getTime())/86400000)]++;
    for(const r of members){byCompetition[r.tournamentId]=(byCompetition[r.tournamentId]??0)+1/members.length;r.last=at;r.proven=true;
      const kick=r.kicks.find(k=>k>at);r.expiry=r.publicEligible&&r.recentNative&&kick?new Date(at+freshnessTtlMs((kick-at)/3600000,feeds,scale)).toISOString():null;}};
  const requestedFeeds=[...new Set(rows.map(row=>row.bookmaker))];
  for(let at=now.getTime();at<now.getTime()+days*86400000;at+=SCHEDULER_TICK_MINUTES*60000){
    for(const bookmaker of requestedFeeds){
      const planned=rows.filter(r=>r.bookmaker===bookmaker).flatMap(r=>{
        const kick=r.kicks.find(k=>k>at);if(!kick||kick>at+7*86400000)return [];
        const hours=(kick-at)/3600000;
        const base=r.catalogEmpty?720:r.publicEligible?cadenceIntervalMinutes(hours,feeds)!:1440;
        const interval=scaledInterval(base,scale)*60000;
        return [{r,dueAt:Math.max(r.publicEligible?expiryDue(r.last+interval,r.expiry):r.last+interval,r.retry)}];
      });
      const due=planned.filter(p=>p.dueAt<=at);
      const stable=due.filter(p=>isStableOddsTournament(p.r.tournamentId));
      for(let i=0;i<stable.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)record(bookmaker,stable.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST).map(p=>p.r),at);
      const proven=due.filter(p=>!isStableOddsTournament(p.r.tournamentId)&&p.r.proven);
      for(let i=0;i<proven.length;i+=MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)record(bookmaker,proven.slice(i,i+MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST).map(p=>p.r),at);
      const unproven=due.filter(p=>!isStableOddsTournament(p.r.tournamentId)&&!p.r.proven).slice(0,MAX_UNPROVEN_PROBES_PER_TICK);
      unproven.forEach(p=>record(bookmaker,[p.r],at));
    }
  }
  return {requests:count,byBookmaker,byCompetition,byDay,peakDailyRequests:Math.max(0,...byDay)};
}

describe('optimized forecast preserves the original five-minute simulation',()=>{
  const now=new Date('2026-10-04T12:01:23Z');
  const date=(hours:number)=>new Date(now.getTime()+hours*3600000).toISOString();
  const ids=['325','17','27464','384','9999','671','672','678','681','764','767','3211'];
  const targets:RefreshTarget[]=['betsson.co','betsson.pe','verified.mx'].flatMap((bookmaker,bookIndex)=>ids.map((tournamentId,i)=>({
    bookmaker,tournamentId,publicEligible:bookIndex!==2,hasUsefulCoverage:i%2===0,
    lastSuccessAt:i%3===0?null:date(-4),lastCheckedAt:i%4===0?date(-1):null,needsCadenceRefresh:i===2,
    retryAfter:i===4?date(5):i===5?'invalid':null,
    consecutiveFailures:i===6?2:0,recentNative:i%2===0,nativeExpiryAt:i%2===0?date(i===0?-.1:.1):'invalid',
    catalogEmpty:i===8,unsupported:i===9,mappingBlocked:i===10,
    fixtures:[...[-1,0,.1,2,24,72,168,192].map((hours,index)=>({id:`${i}-${index}`,kickoff:date(hours+i/6),status:'SCHEDULED'})),
      {id:'invalid',kickoff:'invalid',status:'SCHEDULED'},{id:'finished',kickoff:date(.05),status:'FINISHED'}],
  })));
  it.each([[.01,1],[1.25,1],[2,2.45],[7,19.78],[.5,128]])('matches every accounting field for %s days at scale %s',(days,scale)=>{
    // The last duplicate wins, preserving the original insertion order.
    const input=[...targets,{...targets[0],lastSuccessAt:date(-7)}];
    expect(forecastDetail(input,now,days,scale)).toEqual(referenceForecast(input,now,days,scale));
  });
  it('keeps empty inventories and out-of-window fixtures at zero requests',()=>{
    for(const input of [[],[{...targets[0],fixtures:[{id:'far',kickoff:date(250),status:'SCHEDULED'}]}]])
      expect(forecastDetail(input,now,1,1)).toEqual(referenceForecast(input,now,1,1));
  });
});
