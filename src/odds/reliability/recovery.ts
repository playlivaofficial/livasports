import type {DatabaseClient} from '@/database/client';
import {M5OddsPapiAdapter} from '@/providers/oddspapi/M5OddsPapiAdapter';
import {verifyCatalog} from '@/providers/oddspapi/m5-normalizer';
import {schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';
import {budgetHealth,OddsBudgetStopped} from '../budget';
import {endOddsJob,persistSnapshot,startOddsJob} from '../ingestion';
import {readVerifiedOperatorFeeds} from '../operator-feeds';
import {claimRefreshTargets,releaseRefreshTargets} from '../refresh-queue';
import {isCoreGeo,type CoreGeo} from '@/config/geo';
import {safeSchedulerError} from '../scheduler';
import {logRecoveryAction} from './incidents';

export const TARGETED_REFRESH_MIN_INTERVAL_MINUTES=15;
export const OWNER_ACTION_RATE_LIMIT_MINUTES=5;
export const TARGETED_REFRESH_REQUEST_CAP=6;
export function parseRecoveryTarget(value:unknown):{geo:CoreGeo|null;canonical:string}|null{
  if(typeof value!=='string')return null;
  const parts=value.split(':'),geo=parts.length===2&&isCoreGeo(parts[0])?parts[0]:null;
  const canonical=parts.length===1?parts[0]:geo?parts[1]:null;
  return canonical&&/^[-a-z0-9]{1,100}$/.test(canonical)?{geo,canonical}:null;
}
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
  const parsed=parseRecoveryTarget(competition);if(!parsed)return fail('INVALID_TARGET');
  const {geo,canonical}=parsed;
  const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
  if(!catalog)return fail('ODDS_CATALOG_UNVERIFIED');
  try{verifyCatalog(catalog.markets,catalog.tournaments);}catch{return fail('ODDS_CATALOG_UNVERIFIED');}
  const tournaments=schedulerTournaments(catalog.tournaments);
  const target=tournaments.find(t=>t.canonical===canonical);
  if(!target){await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,reason:options.reason,outcome:'REJECTED_TARGET_MISSING'});return fail('TARGET_MISSING');}
  const operatorFeeds=(await readVerifiedOperatorFeeds(db)).filter(feed=>!geo||feed.geo===geo);
  const providerIds=[...new Set(operatorFeeds.map(feed=>feed.providerBookmakerId))];
  if(!providerIds.length){await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_NO_VERIFIED_FEEDS'});return fail('NO_VERIFIED_FEEDS',target.id);}
  // Failed upstream requests must respect the same cooldown as successful snapshots.
  const recent=await db.query(`SELECT greatest(
    (SELECT max(last_attempt_at) FROM odds_refresh_targets WHERE tournament_id=$1),
    (SELECT max(at) FROM odds_recovery_actions WHERE tournament_id=$1 AND action='TARGETED_REFRESH' AND request_cost>0)
  ) AS at`,[target.id]);
  const last=recent.rows[0]?.at?new Date(recent.rows[0].at).getTime():0;
  if(now.getTime()-last<TARGETED_REFRESH_MIN_INTERVAL_MINUTES*60000){
    await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_MIN_INTERVAL',nextRetryAt:new Date(last+TARGETED_REFRESH_MIN_INTERVAL_MINUTES*60000).toISOString()});
    return fail('MIN_INTERVAL',target.id,Math.min(providerIds.length,TARGETED_REFRESH_REQUEST_CAP));
  }
  const records=(await db.query(`SELECT bookmaker,due_at,last_attempt_at,retry_after,next_recheck_at,lease_until FROM odds_refresh_targets
    WHERE tournament_id=$1 AND bookmaker=ANY($2::text[])`,[target.id,providerIds])).rows;
  const time=(value:unknown)=>value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):0;
  const eligible=providerIds.map(id=>({id,row:records.find(r=>r.bookmaker===id)}))
    .filter(({row})=>!row||[row.retry_after,row.next_recheck_at,row.lease_until].every(v=>!v||Number.isFinite(time(v))&&time(v)<=now.getTime()))
    .sort((a,b)=>time(a.row?.due_at)-time(b.row?.due_at)||time(a.row?.last_attempt_at)-time(b.row?.last_attempt_at)||a.id.localeCompare(b.id))
    .slice(0,TARGETED_REFRESH_REQUEST_CAP).map(row=>row.id);
  const cost=eligible.length;
  if(!cost){await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_FEED_BACKOFF'});return fail('FEED_BACKOFF',target.id);}
  const budget=await budgetHealth(db);
  const headroom='rollingHeadroom' in budget?Number(budget.rollingHeadroom):0;
  if(!budget.verified||headroom<cost){
    await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,requestCost:cost,outcome:'REJECTED_BUDGET',budgetRemainingAfter:headroom});
    return fail('BUDGET_HEADROOM',target.id,cost);
  }
  let job:string;
  try{job=await startOddsJob(db);}catch{await logRecoveryAction(db,{trigger:options.trigger,action:'TARGETED_REFRESH',competition,tournamentId:target.id,reason:options.reason,outcome:'REJECTED_CONCURRENT'});return fail('CONCURRENT_REFRESH',target.id,cost);}
  await db.query("UPDATE odds_sync_jobs SET trigger_source='CONTROLLED' WHERE id=$1",[job]);
  // Each configured independent feed gets at most one attempt. A retry must not consume its peer's slot.
  const provider=new M5OddsPapiAdapter(db,key,job,cost,true,Date.now()+140000,tournaments,0);
  provider.setOperatorFeeds(operatorFeeds);provider.setMarketCatalog(catalog.markets);
  const feeds:TargetedRefreshResult['feeds']=[];let ok=true;
  try{
    for(const bookmaker of eligible){
      try{
        // Owner refresh can promote a waiting target, but never steal a lease or override backoff.
        await db.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,queue_state,pending_since)
          VALUES($1,$2,'PENDING',$3) ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET queue_state='PENDING',pending_since=COALESCE(odds_refresh_targets.pending_since,$3)
          WHERE (odds_refresh_targets.lease_until IS NULL OR odds_refresh_targets.lease_until<=$3)
            AND (odds_refresh_targets.retry_after IS NULL OR odds_refresh_targets.retry_after<=$3)
            AND (odds_refresh_targets.next_recheck_at IS NULL OR odds_refresh_targets.next_recheck_at<=$3)`,[bookmaker,target.id,now.toISOString()]);
        await claimRefreshTargets(db,job,bookmaker,[target.id]);
        const before=provider.requestCount();
        // The attempt is durable even if the provider fails before a snapshot can be persisted.
        try{
        const snapshot=await provider.snapshot(bookmaker,[target.id]);
        const saved=await persistSnapshot(db,job,snapshot);
        const verified=saved.outcomes.length>0&&saved.outcomes.every(o=>o.meaningful);
        if(!verified)ok=false;
        feeds.push({bookmaker,outcome:verified?'SUCCEEDED':saved.outcomes[0]?.outcome??'UNVERIFIED',quotes:saved.quotes,matchedFixtures:saved.matchedFixtures,returnedFixtures:saved.returnedFixtures});
        }catch(error){
          if(provider.requestCount()>before)await db.query(`UPDATE odds_refresh_targets SET last_attempt_at=$3,
            retry_after=greatest(retry_after,$3::timestamptz+interval '15 minutes'),last_error=$4
            WHERE bookmaker=$1 AND tournament_id=$2`,[bookmaker,target.id,now.toISOString(),safeSchedulerError(error)]);
          throw error;
        }
      }catch(error){
        const code=safeSchedulerError(error);feeds.push({bookmaker,outcome:'FAILED',error:code});ok=false;
        if(error instanceof OddsBudgetStopped||['ODDSPAPI_HTTP_401','ODDSPAPI_HTTP_403','ODDSPAPI_HTTP_429','ODDS_NETWORK_ERROR','ODDS_RUN_CAP_REACHED','ODDS_RUN_DEADLINE'].includes(code)||/^ODDSPAPI_HTTP_5\d\d$/.test(code))break;
      }
    }
  }finally{try{await releaseRefreshTargets(db,job);}finally{await endOddsJob(db,job,ok);}}
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
