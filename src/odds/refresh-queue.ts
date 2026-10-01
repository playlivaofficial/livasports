import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {SCHEDULER_TICK_MINUTES,type planScheduler} from './scheduler-policy';

/** Reconcile dirty targets from the existing cadence, without changing its request allowance. */
export async function reconcileRefreshQueue(db:QueryExecutor,plan:ReturnType<typeof planScheduler>){
  const rows=plan.targets.map(t=>({bookmaker:t.bookmaker,tournament:t.tournamentId,due:t.nextDueAt,
    stale:t.intervalMinutes===null?null:new Date(Date.parse(t.normalDueAt??plan.at)+SCHEDULER_TICK_MINUTES*60000).toISOString(),
    state:t.delayReason==='MAPPING_REVIEW_REQUIRED'||t.delayReason==='UNSUPPORTED'?'BLOCKED':t.intervalMinutes===null?'WAITING':t.delayReason?'BACKOFF':t.due?'PENDING':'WAITING'}));
  await db.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,queue_state,due_at,stale_after,pending_since)
    SELECT bookmaker,tournament,state,due,stale,CASE WHEN state='PENDING' THEN $2::timestamptz END
    FROM jsonb_to_recordset($1::jsonb) AS r(bookmaker text,tournament text,state text,due timestamptz,stale timestamptz)
    ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET queue_state=excluded.queue_state,due_at=excluded.due_at,stale_after=excluded.stale_after,
      pending_since=CASE WHEN excluded.queue_state='PENDING' THEN COALESCE(odds_refresh_targets.pending_since,$2::timestamptz) END,
      lease_job_id=NULL,lease_until=NULL
    WHERE odds_refresh_targets.lease_until IS NULL OR odds_refresh_targets.lease_until<=$2::timestamptz`,[JSON.stringify(rows),plan.at]);
}
export async function claimRefreshTargets(db:DatabaseClient,job:string,bookmaker:string,ids:readonly string[]){
  return db.transaction(async tx=>{
    const claimed=await tx.query(`UPDATE odds_refresh_targets SET queue_state='LEASED',lease_job_id=$1,lease_until=now()+interval '3 minutes'
      WHERE bookmaker=$2 AND tournament_id=ANY($3::text[]) AND queue_state='PENDING'
        AND (lease_until IS NULL OR lease_until<=now()) RETURNING tournament_id`,[job,bookmaker,ids]);
    if(claimed.rowCount!==ids.length)throw new Error('ODDS_TARGET_LEASE_UNAVAILABLE');
    return claimed.rowCount;
  });
}
export async function releaseRefreshTargets(db:QueryExecutor,job:string){
  await db.query(`UPDATE odds_refresh_targets SET queue_state=CASE WHEN retry_after>now() THEN 'BACKOFF' ELSE 'PENDING' END,
    lease_job_id=NULL,lease_until=NULL WHERE lease_job_id=$1`,[job]);
}
