import {ACTIVE_BOOKMAKER_IDS} from '../registry';
import {cadenceIntervalMinutes,SCHEDULER_TICK_MINUTES} from '../scheduler-policy';
export interface DataTarget {
  competition:string;bookmaker:string;hiddenInsurance:boolean;fixtures:number;tournamentId:string|null;
  state:string;responsibility:'NONE'|'PROVIDER'|'LIVASPORTS'|'BUDGET'|'UNVERIFIED';
  lastAttemptAt:string|null;lastSuccessAt:string|null;lastNativePersistAt:string|null;lastCheckedAt:string|null;
  nextDueAt:string|null;staleAfter:string|null;staleReason:string|null;retryAfter:string|null;overdueMinutes:number;
  queueState:string;outcome:string|null;nativeSelections:number;fallbackSelections:number;
}
type TargetRow={bookmaker:string;tournament_id:string;[key:string]:unknown};
const iso=(value:unknown)=>value instanceof Date?value.toISOString():typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function dataPlaneTargets(competitions:readonly {competition:string;tournamentId:string|null;nearestKickoff:string|null;fixtures7d:number}[],
  records:readonly TargetRow[],cells:readonly {competition:string;bookmaker:string;kind:string;reason?:string|null}[],now:Date,budgetBlocked:boolean):DataTarget[]{
  return competitions.flatMap(c=>ACTIVE_BOOKMAKER_IDS.map(bookmaker=>{
    const r=records.find(t=>t.bookmaker===bookmaker&&t.tournament_id===c.tournamentId);
    const checked=iso(r?.last_checked_at),success=iso(r?.last_success_at),attempt=iso(r?.last_attempt_at),retry=iso(r?.retry_after);
    const interval=c.nearestKickoff?cadenceIntervalMinutes((Date.parse(c.nearestKickoff)-+now)/3600000,4):null;
    const nextDue=c.fixtures7d?iso(r?.due_at)??(interval&& (checked??success)?new Date(Date.parse((checked??success)!)+interval*60000).toISOString():now.toISOString()):null;
    const staleAfter=c.fixtures7d?(iso(r?.stale_after)??(nextDue?new Date(Date.parse(nextDue)+SCHEDULER_TICK_MINUTES*60000).toISOString():null)):null;
    const overdue=staleAfter?Math.max(0,(+now-Date.parse(staleAfter))/60000):0;
    const own=cells.filter(x=>x.competition===c.competition&&x.bookmaker===bookmaker);
    const native=own.filter(x=>x.kind==='REAL').length,fallback=own.filter(x=>x.kind==='PROXY').length;
    const outcome=typeof r?.last_outcome==='string'?r.last_outcome:null,error=String(r?.last_error??'');
    let state='HEALTHY',responsibility:DataTarget['responsibility']='NONE',reason:string|null=null;
    if(!c.fixtures7d){state='OUTSIDE_REFRESH_WINDOW';}
    else if(!c.tournamentId){state='TARGET_NOT_FOUND';responsibility='LIVASPORTS';reason='No deterministic provider tournament mapping';}
    else if(!r){state='REFRESH_OVERDUE';responsibility='LIVASPORTS';reason='Expected refresh target has not been enqueued';}
    else if(outcome==='MAPPING_EMPTY'||outcome==='PARSER_EMPTY'||['MAPPING','MARKET'].includes(String(r?.failure_class))||Number((r?.outcome_evidence as {unmappedFixtures?:number})?.unmappedFixtures??0)>0||own.some(x=>['IDENTITY_UNRESOLVED','MARKET_MAPPING_FAILURE','INGESTION_BUG'].includes(x.reason??''))){state='MAPPING_DEGRADED';responsibility='LIVASPORTS';reason=`${outcome??r?.failure_class??'SAVED_DIAGNOSTICS'}; unresolved identities/schema require deterministic repair, not repeated provider requests`;}
    else if(/401|403/.test(error)){state='AUTH_ERROR';responsibility='LIVASPORTS';reason=error;}
    else if(/429/.test(error)){state='RATE_LIMITED';responsibility='PROVIDER';reason=error;}
    else if(/5\d\d|NETWORK|TIMEOUT/.test(error)){state='PROVIDER_DOWN';responsibility='PROVIDER';reason=error;}
    else if(/404/.test(error)&&attempt&&+now-Date.parse(attempt)<24*3600000){state='TARGET_NOT_FOUND';responsibility='PROVIDER';reason='Provider returned 404; bounded recheck, not permanent suppression';}
    else if(r?.queue_state==='BLOCKED'){state='TARGET_NOT_FOUND';responsibility='PROVIDER';reason='Verified unsupported target; no automatic requests';}
    else if(overdue>0){state=budgetBlocked?'BUDGET_DEFERRED':'REFRESH_OVERDUE';responsibility=budgetBlocked?'BUDGET':'LIVASPORTS';reason='Due refresh missed the scheduler-tick grace';}
    else if(r?.queue_state==='LEASED'){state='RECOVERING';}
    else if(!native&&bookmaker!=='betano.bet.br'){
      state=outcome==='VALID_EMPTY'||outcome==='PROVIDER_EMPTY'?'PROVIDER_EMPTY':'PARTIAL_PROVIDER_COVERAGE';
      responsibility=outcome==='VALID_EMPTY'||outcome==='PROVIDER_EMPTY'?'PROVIDER':'UNVERIFIED';reason=outcome??'No current native selection; inspect per-fixture evidence';
    }
    return {competition:c.competition,bookmaker,hiddenInsurance:bookmaker==='betano.bet.br',fixtures:c.fixtures7d,tournamentId:c.tournamentId,
      state,responsibility,lastAttemptAt:attempt,lastSuccessAt:success,lastNativePersistAt:iso(r?.last_native_persist_at),lastCheckedAt:checked,
      nextDueAt:nextDue,staleAfter,staleReason:reason,retryAfter:retry,overdueMinutes:Math.round(overdue),queueState:String(r?.queue_state??'UNINITIALIZED'),outcome,nativeSelections:native,fallbackSelections:fallback};
  }));
}
