import type {DatabaseClient} from '@/database/client';
import {M5OddsPapiAdapter} from '@/providers/oddspapi/M5OddsPapiAdapter';
import {verifyCatalog} from '@/providers/oddspapi/m5-normalizer';
import {schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';
import {budgetHealth,OddsBudgetStopped} from '../budget';
import {endOddsJob,persistSnapshot,startOddsJob} from '../ingestion';
import {SCHEDULER_BOOKMAKERS} from '../scheduler-policy';
import {safeSchedulerError} from '../scheduler';
import {logRecoveryAction} from './incidents';

export const TARGETED_REFRESH_MIN_INTERVAL_MINUTES=15;
export const OWNER_ACTION_RATE_LIMIT_MINUTES=5;
export interface TargetedRefreshResult {
  ok:boolean;code:string;competition:string;tournamentId:string|null;requestCost:number;requests:number;
  feeds:Array<{bookmaker:string;outcome:string;quotes?:number;matchedFixtures?:number;returnedFixtures?:number;error?:string}>;budgetHeadroomAfter:number|null;
}
/**
 * Bounded targeted refresh (P3 §24): verifies the target, computes the request cost, checks live ledger headroom,
 * enforces a minimum interval, rejects concurrent refreshes through the worker lock, records every request in the
 * ledger (as SCHEDULED so pacing stays honest) and logs the action. Never a "refresh everything".
 */
export async function runTargetedRefresh(db:DatabaseClient,key:string,competition:string,options:{trigger:'OWNER'|'SCHEDULER';reason:string;now?:Date}):Promise<TargetedRefreshResult>{
  const now=options.now??new Date();
  const fail=(code:string,tournamentId:string|null=null,cost=0):TargetedRefreshResult=>({ok:false,code,competition,tournamentId,requestCost:cost,requests:0,feeds:[],budgetHeadroomAfter:null});
  const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
  if(!catalog)return fail('ODDS_CATALOG_UNVERIFIED');
  try{verifyCatalog(catalog.markets,catalog.tournaments);}catch{return fail('ODDS_CATALOG_UNVERIFIED');}
  const tournaments=schedulerTournaments(catalog.tournaments);
  const target=tournaments.find(t=>t.canonical===competition);
  if(!target){await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,reason:options.reason,outcome:'REJECTED_TARGET_MISSING'});return fail('TARGET_MISSING');}
  const cost=SCHEDULER_BOOKMAKERS.length;
  // Failed upstream requests must respect the same cooldown as successful snapshots.
  const recent=await db.query(`SELECT greatest(
    (SELECT max(last_attempt_at) FROM odds_refresh_targets WHERE tournament_id=$1),
    (SELECT max(at) FROM odds_recovery_actions WHERE tournament_id=$1 AND action='TARGETED_REFRESH' AND request_cost>0)
  ) AS at`,[target.id]);
  const last=recent.rows[0]?.at?new Date(recent.rows[0].at).getTime():0;
  if(now.getTime()-last<TARGETED_REFRESH_MIN_INTERVAL_MINUTES*60000){
    await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_MIN_INTERVAL',nextRetryAt:new Date(last+TARGETED_REFRESH_MIN_INTERVAL_MINUTES*60000).toISOString()});
    return fail('MIN_INTERVAL',target.id,cost);
  }
  const budget=await budgetHealth(db);
  const headroom='rollingHeadroom' in budget?Number(budget.rollingHeadroom):0;
  if(!budget.verified||headroom<cost){
    await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,requestCost:cost,outcome:'REJECTED_BUDGET',budgetRemainingAfter:headroom});
    return fail('BUDGET_HEADROOM',target.id,cost);
  }
  let job:string;
  try{job=await startOddsJob(db);}catch{await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_CONCURRENT'});return fail('CONCURRENT_REFRESH',target.id,cost);}
  await db.query("UPDATE odds_sync_jobs SET trigger_source='CONTROLLED' WHERE id=$1",[job]);
  // The advertised two-request drill gives each independent bookmaker one attempt. A retry must not consume its peer's slot.
  const provider=new M5OddsPapiAdapter(db,key,job,cost,true,Date.now()+140000,tournaments,0);
  const feeds:TargetedRefreshResult['feeds']=[];let ok=true;
  try{
    for(const bookmaker of SCHEDULER_BOOKMAKERS){
      try{
        const snapshot=await provider.snapshot(bookmaker,[target.id]);
        const saved=await persistSnapshot(db,job,snapshot);
        feeds.push({bookmaker,outcome:'SUCCEEDED',quotes:saved.quotes,matchedFixtures:saved.matchedFixtures,returnedFixtures:saved.returnedFixtures});
      }catch(error){
        const code=safeSchedulerError(error);feeds.push({bookmaker,outcome:'FAILED',error:code});ok=false;
        if(error instanceof OddsBudgetStopped)break;
      }
    }
  }finally{await endOddsJob(db,job,ok);}
  const after=await budgetHealth(db);
  const remaining='rollingHeadroom' in after?Number(after.rollingHeadroom):null;
  await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,requestCost:provider.requestCount(),
    outcome:ok?'SUCCEEDED':feeds.some(f=>f.outcome==='SUCCEEDED')?'PARTIAL':'FAILED',budgetRemainingAfter:remaining,detail:{feeds}});
  return {ok,code:ok?'OK':'PARTIAL_OR_FAILED',competition,tournamentId:target.id,requestCost:cost,requests:provider.requestCount(),feeds,budgetHeadroomAfter:remaining};
}

/** Owner actions that consume provider requests are rate-limited platform-wide (one per window), independent of the caller. */
export async function ownerActionRecentlyRan(db:DatabaseClient,action:string){
  const r=await db.query(`SELECT at FROM odds_recovery_actions WHERE trigger_source='OWNER' AND action=$1 AND outcome NOT LIKE 'REJECTED%' AND at>now()-($2::int*interval '1 minute') LIMIT 1`,[action,OWNER_ACTION_RATE_LIMIT_MINUTES]);
  return r.rows[0]?.at?new Date(r.rows[0].at).toISOString():null;
}
