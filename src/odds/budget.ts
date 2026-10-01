import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {ACTIVE_BOOKMAKER_IDS} from './registry';
import {NORMAL_STOP_FRACTION,CONTROLLED_STOP_FRACTION,quotaPressure} from './quota-policy';

// 250 calls remain untouched for reconciliation lag/out-of-band usage; 100 more for controlled recovery/catalog work.
export const INTERNAL_LIMIT=4750;
export const ROUTINE_LIMIT=4650;
/** Burst ceiling only. Each reservation also checks remaining quota / actual subscription days. */
export const DAILY_ROUTINE_LIMIT=ROUTINE_LIMIT;
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
    ACTIVE_BOOKMAKER_IDS.some(book=>s.bookmakers?.[book]?.has_live_odds!==false||s.bookmakers?.[book]?.has_player_props!==false))
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
    count(r.id) FILTER(WHERE NOT r.billable)::int AS unmetered_calls,
    (SELECT count(*) FROM odds_provider_requests d WHERE d.billable AND d.started_at>now()-interval '24 hours')::int AS rolling_day,
    (SELECT count(*) FROM odds_provider_requests d WHERE d.billable AND d.started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today_utc,
    (SELECT count(*) FROM odds_provider_requests d WHERE d.billable AND d.started_at>now()-interval '3 days')::int AS rolling_three_days
    FROM odds_budget_baselines b LEFT JOIN odds_provider_requests r ON r.started_at>=b.period_start AND r.started_at<b.period_end
    WHERE now()>=b.period_start AND now()<b.period_end GROUP BY b.period_start`)).rows[0];
  if(!row)return {verified:false,state:'BUDGET_STOPPED',reason:'NO_VERIFIED_CURRENT_PERIOD',safeRemaining:0};
  const used=Number(row.externally_consumed)+Number(row.local_counted);
  const routineRemaining=Math.max(0,ROUTINE_LIMIT-used);
  const remainingDays=Math.max(1,(new Date(row.period_end).getTime()-Date.now())/86400000);
  const rollingDay=Number(row.rolling_day??0);const dailyCap=routineDailyCap(routineRemaining,remainingDays);
  const governor=budgetGovernor({used,routineRemaining,remainingDays,rollingDay,dailyCap,rollingThreeDays:Number(row.rolling_three_days??0),hardLimit:Number(row.hard_limit)});
  governor.requestsTodayUtc=Number(row.today_utc??0);
  governor.projectedEndOfDayUsage=Math.ceil(governor.requestsTodayUtc/Math.max(1,(Date.now()-Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'))/3600000)*24);
  return {...row,verified:true,used,internalLimit:INTERNAL_LIMIT,routineLimit:ROUTINE_LIMIT,
    safeRemaining:Math.max(0,Math.min(INTERNAL_LIMIT,Number(row.hard_limit))-used),routineRemaining,
    // P0 incident: the scheduler paces itself against the ledger's rolling-day ceiling instead of bursting into it.
    rollingDay,dailyCap,rollingHeadroom:Math.max(0,Math.floor(dailyCap*CONTROLLED_STOP_FRACTION)-rollingDay),governor,
    requestsTodayUtc:Number(row.today_utc??0),estimatedRequestsRemaining:Math.max(0,dailyCap-rollingDay),
    quota:quotaPressure(rollingDay,dailyCap),
    projectedEndOfDayUsage:Math.ceil(Number(row.today_utc??0)/Math.max(1,(Date.now()-Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'))/3600000)*24)};
}
/** Share of the daily ceiling held back for urgent/recovery work (mirrors the planner's reserve) and for catalog discovery. */
export const URGENT_RESERVE_FRACTION=0.2;
export const RECOVERY_RESERVE_FRACTION=0.1;
export const DISCOVERY_RESERVE_REQUESTS=2;
export interface BudgetGovernor {
  periodAllowance:number;routineAllowance:number;used:number;remaining:number;routineRemaining:number;remainingDays:number;
  rollingDay:number;dailyCap:number;headroom:number;projectedDailyRequests:number;projectedEndOfPeriodUsage:number;projectedOverrun:boolean;
  urgentReserve:number;recoveryReserve:number;discoveryReserve:number;routineCeiling:number;routineHeadroom:number;
  pressure:'NORMAL'|'PACED'|'RESERVE_ONLY'|'EXHAUSTED';
  utilizationPct:number;quotaState:ReturnType<typeof quotaPressure>['state'];normalStop:number;controlledStop:number;
  requestsTodayUtc?:number;projectedEndOfDayUsage?:number;
}
/** Durable, plan-derived budget governor (P3 §8). Never invents capacity: every number derives from the verified period. */
export function budgetGovernor(input:{used:number;routineRemaining:number;remainingDays:number;rollingDay:number;dailyCap:number;rollingThreeDays:number;hardLimit:number}):BudgetGovernor{
  const headroom=Math.max(0,input.dailyCap-input.rollingDay);
  const urgentReserve=Math.ceil(input.dailyCap*URGENT_RESERVE_FRACTION),recoveryReserve=Math.ceil(input.dailyCap*RECOVERY_RESERVE_FRACTION);
  const routineCeiling=Math.max(0,input.dailyCap-urgentReserve);
  const projectedDaily=Math.round(input.rollingThreeDays/3);
  const projectedEnd=input.used+projectedDaily*input.remainingDays;
  const pressure:BudgetGovernor['pressure']=input.routineRemaining<=0||headroom===0?'EXHAUSTED':headroom<=urgentReserve?'RESERVE_ONLY':quotaPressure(input.rollingDay,input.dailyCap).state!=='NORMAL'?'PACED':'NORMAL';
  return {periodAllowance:Math.min(INTERNAL_LIMIT,input.hardLimit),routineAllowance:ROUTINE_LIMIT,used:input.used,remaining:Math.max(0,Math.min(INTERNAL_LIMIT,input.hardLimit)-input.used),
    routineRemaining:input.routineRemaining,remainingDays:Math.round(input.remainingDays*100)/100,rollingDay:input.rollingDay,dailyCap:input.dailyCap,headroom,
    projectedDailyRequests:projectedDaily,projectedEndOfPeriodUsage:Math.round(projectedEnd),projectedOverrun:projectedEnd>ROUTINE_LIMIT,
    urgentReserve,recoveryReserve,discoveryReserve:DISCOVERY_RESERVE_REQUESTS,routineCeiling,routineHeadroom:Math.max(0,headroom-urgentReserve),pressure,
    utilizationPct:quotaPressure(input.rollingDay,input.dailyCap).utilizationPct,quotaState:quotaPressure(input.rollingDay,input.dailyCap).state,
    normalStop:Math.floor(input.dailyCap*NORMAL_STOP_FRACTION),controlledStop:Math.floor(input.dailyCap*CONTROLLED_STOP_FRACTION)};
}
/** Same paced daily ceiling the ledger enforces per reservation (rolling 24h of SCHEDULED billable requests). */
export function routineDailyCap(routineRemaining:number,remainingDays:number):number {
  return Math.min(DAILY_ROUTINE_LIMIT,Math.max(1,Math.floor(Math.max(0,routineRemaining)/Math.max(1,remainingDays))));
}
export async function reserveOddsRequest(tx:QueryExecutor,input:{id:string;jobId:string;endpoint:string;query:Record<string,string>;routine:boolean;unmetered:boolean}){
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-m5-odds-budget'))");
  if(!input.unmetered){
    // Same upper bound as twelve 5-minute ticks × six requests, shared by manual and automatic workers.
    const hourly=await tx.query("SELECT count(*)::int AS used FROM odds_provider_requests WHERE billable AND started_at>now()-interval '1 hour'");
    if(Number(hourly.rows[0]?.used??0)>=72)throw new OddsBudgetStopped('ODDS_HOURLY_BUDGET_EXHAUSTED');
    const circuit=await tx.query(`WITH failures AS (
      SELECT max(started_at) AS latest,count(*) AS n FROM odds_provider_requests
      WHERE (http_status=429 OR http_status>=500 OR outcome='NETWORK_ERROR')
        AND started_at>now()-interval '6 hours'
        AND started_at>COALESCE((SELECT max(started_at) FROM odds_provider_requests WHERE billable AND outcome='SUCCEEDED'),'-infinity'::timestamptz)
    ) SELECT EXISTS(SELECT 1 FROM odds_provider_requests WHERE http_status IN (401,403) AND started_at>now()-interval '6 hours')
      OR EXISTS(SELECT 1 FROM failures WHERE latest+LEAST(360,15*power(2,LEAST(n-1,5)))*interval '1 minute'>now()) AS blocked`);
    if(circuit.rows[0]?.blocked===true)throw new OddsBudgetStopped('ODDS_UPSTREAM_COOLDOWN');
    if(input.endpoint==='/v4/odds-by-tournaments'){
      const repeated=await tx.query(`SELECT EXISTS(SELECT 1 FROM odds_provider_requests WHERE endpoint=$1 AND safe_query->>'bookmaker'=$2
        AND string_to_array(safe_query->>'tournamentIds',',') && string_to_array($3,',')
        AND ((outcome='SUCCEEDED' AND started_at>now()-interval '5 minutes') OR
          (http_status>=400 AND http_status<429 AND http_status<>404 AND started_at>now()-interval '6 hours'))) AS blocked`,
        [input.endpoint,input.query.bookmaker,input.query.tournamentIds]);
      if(repeated.rows[0]?.blocked===true)throw new OddsBudgetStopped('ODDS_DUPLICATE_OR_FAILED_TARGET_COOLDOWN');
    }
    const budget=await tx.query(`SELECT b.hard_limit,b.externally_consumed+(SELECT count(*) FROM odds_provider_requests r
      WHERE r.billable AND r.started_at>=b.period_start AND r.started_at<b.period_end) AS consumed,
      (SELECT count(*) FROM odds_provider_requests r WHERE r.billable AND r.started_at>now()-interval '24 hours') AS rolling_day,
      GREATEST(1,EXTRACT(EPOCH FROM (b.period_end-now()))/86400) AS remaining_days
      FROM odds_budget_baselines b WHERE now()>=period_start AND now()<period_end FOR UPDATE`);
    if(budget.rows.length!==1||Number(budget.rows[0].consumed)>=Math.min(input.routine?ROUTINE_LIMIT:INTERNAL_LIMIT,Number(budget.rows[0].hard_limit))||
      (Number(budget.rows[0].rolling_day??0)>=Math.floor((input.routine?NORMAL_STOP_FRACTION:CONTROLLED_STOP_FRACTION)*routineDailyCap(
        ROUTINE_LIMIT-Number(budget.rows[0].consumed),Number(budget.rows[0].remaining_days??1)))))
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
  if(input.endpoint==='/v4/odds-by-tournaments')await tx.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,last_attempt_at)
    SELECT $1,unnest(string_to_array($2,',')),now() ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET last_attempt_at=now()`,[input.query.bookmaker,input.query.tournamentIds]);
}
