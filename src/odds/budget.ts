import type {DatabaseClient,QueryExecutor} from '@/database/client';

export const INTERNAL_LIMIT=4500;
export const ROUTINE_LIMIT=4000;
/** Burst ceiling only. Each reservation also checks remaining quota / actual subscription days. */
export const DAILY_ROUTINE_LIMIT=240;
export class OddsBudgetStopped extends Error {constructor(public readonly code:string){super(code);this.name='OddsBudgetStopped';}}
export interface AccountPeriod {start:string;end:string;limit:number;used:number;}
/** Only documented, bounded subscription windows are accepted. Never derive a calendar-month reset. */
export function verifiedAccountPeriod(value:unknown,now=new Date()):AccountPeriod {
  const body=value as {subscriptions?:Array<{is_active?:boolean;valid_from?:string;valid_until?:string;request_limit?:number;request_count?:number;sport_ids?:number[];bookmakers?:Record<string,{has_live_odds?:boolean;has_player_props?:boolean}>}>};
  const active=body?.subscriptions?.filter(s=>s.is_active)??[];
  if(active.length!==1)throw new OddsBudgetStopped('ACCOUNT_SCOPE_UNVERIFIED');
  const s=active[0];const start=Date.parse(s.valid_from??'');const end=Date.parse(s.valid_until??'');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>now.getTime()||end<=now.getTime()||end<=start||end-start>32*86400000||
    !Number.isInteger(s.request_count)||s.request_count!<0||s.request_limit!==5000||!s.sport_ids?.includes(10)||
    ['betano.bet.br','betsson'].some(book=>s.bookmakers?.[book]?.has_live_odds!==false||s.bookmakers?.[book]?.has_player_props!==false))
    throw new OddsBudgetStopped('ACCOUNT_PERIOD_OR_SCOPE_UNVERIFIED');
  return {start:new Date(start).toISOString(),end:new Date(end).toISOString(),limit:s.request_limit,used:s.request_count!};
}
export async function reconcileAccountPeriod(db:DatabaseClient,period:AccountPeriod){
  await db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-m5-odds-budget'))");
    const overlap=await tx.query(`SELECT period_start FROM odds_budget_baselines WHERE period_start<>$1 AND period_start<$2 AND period_end>$1`,[period.start,period.end]);
    if(overlap.rowCount)throw new OddsBudgetStopped('ACCOUNT_PERIOD_OVERLAP');
    // Count all attempted billable calls, including unknown outcomes. Never reclaim reserved quota.
    // A never-decreasing external floor preserves M5's conservative pre-audit baseline.
    await tx.query(`INSERT INTO odds_budget_baselines(period_start,period_end,externally_consumed,hard_limit,verified_at,provider_reported_usage,reconciliation_at)
      SELECT $1,$2,GREATEST(0,$3-(SELECT count(*) FROM odds_provider_requests WHERE billable AND started_at>=$1 AND started_at<$2)),5000,now(),$3,now()
      ON CONFLICT(period_start) DO UPDATE SET
        externally_consumed=GREATEST(odds_budget_baselines.externally_consumed,excluded.externally_consumed),
        period_end=LEAST(odds_budget_baselines.period_end,excluded.period_end),hard_limit=LEAST(odds_budget_baselines.hard_limit,excluded.hard_limit),
        provider_reported_usage=excluded.provider_reported_usage,reconciliation_at=now(),verified_at=now()`,[period.start,period.end,period.used]);
  });
}
export async function budgetHealth(db:QueryExecutor){
  const row=(await db.query(`SELECT b.period_start,b.period_end,b.hard_limit,b.externally_consumed,b.provider_reported_usage,b.reconciliation_at,
    count(r.id) FILTER(WHERE r.billable)::int AS local_counted,
    count(r.id) FILTER(WHERE r.outcome='RESERVED' AND r.billable)::int AS reserved,
    count(r.id) FILTER(WHERE r.completed_at IS NOT NULL AND r.billable)::int AS completed,
    count(r.id) FILTER(WHERE r.completed_at IS NOT NULL AND r.outcome<>'SUCCEEDED' AND r.billable)::int AS failed_counted,
    count(r.id) FILTER(WHERE NOT r.billable)::int AS unmetered_calls
    FROM odds_budget_baselines b LEFT JOIN odds_provider_requests r ON r.started_at>=b.period_start AND r.started_at<b.period_end
    WHERE now()>=b.period_start AND now()<b.period_end GROUP BY b.period_start`)).rows[0];
  if(!row)return {verified:false,state:'BUDGET_STOPPED',reason:'NO_VERIFIED_CURRENT_PERIOD',safeRemaining:0};
  const used=Number(row.externally_consumed)+Number(row.local_counted);
  return {...row,verified:true,used,internalLimit:INTERNAL_LIMIT,routineLimit:ROUTINE_LIMIT,
    safeRemaining:Math.max(0,Math.min(INTERNAL_LIMIT,Number(row.hard_limit))-used),routineRemaining:Math.max(0,ROUTINE_LIMIT-used)};
}
export async function reserveOddsRequest(tx:QueryExecutor,input:{id:string;jobId:string;endpoint:string;query:Record<string,string>;routine:boolean;unmetered:boolean}){
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-m5-odds-budget'))");
  if(!input.unmetered){
    const budget=await tx.query(`SELECT b.hard_limit,b.externally_consumed+(SELECT count(*) FROM odds_provider_requests r
      WHERE r.billable AND r.started_at>=b.period_start AND r.started_at<b.period_end) AS consumed,
      (SELECT count(*) FROM odds_provider_requests r WHERE r.billable AND r.purpose='SCHEDULED' AND r.started_at>now()-interval '24 hours') AS rolling_day,
      GREATEST(1,EXTRACT(EPOCH FROM (b.period_end-now()))/86400) AS remaining_days
      FROM odds_budget_baselines b WHERE now()>=period_start AND now()<period_end FOR UPDATE`);
    if(budget.rows.length!==1||Number(budget.rows[0].consumed)>=Math.min(input.routine?ROUTINE_LIMIT:INTERNAL_LIMIT,Number(budget.rows[0].hard_limit))||
      (input.routine&&Number(budget.rows[0].rolling_day)>=Math.min(DAILY_ROUTINE_LIMIT,
        Math.max(1,Math.floor((ROUTINE_LIMIT-Number(budget.rows[0].consumed))/Math.max(1,Number(budget.rows[0].remaining_days??1)))))))
      throw new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED');
  }else{
    // Unmetered account is the ONLY permitted probe after expiry/exhaustion; bounded across restarts.
    const recent=await tx.query("SELECT id FROM odds_provider_requests WHERE endpoint='/v4/account' AND started_at>now()-interval '1 hour' LIMIT 1");
    if(recent.rowCount)throw new OddsBudgetStopped('ACCOUNT_RECONCILIATION_COOLDOWN');
  }
  const lease=await tx.query("UPDATE odds_sync_jobs SET provider_requests=provider_requests+1,heartbeat_at=now(),lease_expires_at=now()+interval '3 minutes' WHERE id=$1 AND status='RUNNING' AND lease_expires_at>now() RETURNING id",[input.jobId]);
  if(!lease.rowCount)throw new Error('ODDS_WORKER_LEASE_LOST');
  await tx.query(`INSERT INTO odds_provider_requests(id,job_id,endpoint,safe_query,billable,purpose) VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
    [input.id,input.jobId,input.endpoint,JSON.stringify(input.query),!input.unmetered,input.routine?'SCHEDULED':'MANUAL']);
}
