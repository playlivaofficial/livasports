import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {alertDecision,alertMessage,retryAlertDelivery,smtpAlertTransport,type AlertTransport} from './alerts';
import {alertEmailConfigured,readReliabilityHealth,type ReliabilityHealth} from './read';
import type {HealthIssue} from './classify';
import {pruneLaunchTelemetry} from '@/analytics/maintenance';
import {persistNativeCoverageReport} from '../native-coverage';
import {recordContinuity} from '../continuity';

export interface RecoveryAction {
  trigger:'SCHEDULER'|'OWNER'|'INTEGRITY';action:string;competition?:string|null;bookmaker?:string|null;tournamentId?:string|null;reason:string;
  requestCost?:number;outcome:string;nextRetryAt?:string|null;budgetRemainingAfter?:number|null;detail?:Record<string,unknown>;
}
/** Every self-healing or owner action is recorded (P3 §22). Failures to log never break the caller. */
export async function logRecoveryAction(db:QueryExecutor,action:RecoveryAction){
  try{
    await db.query(`INSERT INTO odds_recovery_actions(trigger_source,action,competition,bookmaker,tournament_id,reason,request_cost,outcome,next_retry_at,budget_remaining_after,detail)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,[action.trigger,action.action,action.competition??null,action.bookmaker??null,action.tournamentId??null,action.reason.slice(0,500),
      action.requestCost??0,action.outcome.slice(0,120),action.nextRetryAt??null,action.budgetRemainingAfter??null,JSON.stringify(action.detail??{}).slice(0,4000)]);
  }catch{/* audit log is best effort; the operational path continues */}
}

export interface EvaluationResult {
  health:ReliabilityHealth;opened:number;updated:number;resolved:number;alerts:Array<{kind:string;competition:string;classification:string;channel:string}>;
}
const ROLLUP_RETENTION_DAYS=14,ACTION_RETENTION_DAYS=30,INCIDENT_RETENTION_DAYS=90;
export const RESOLVE_GRACE_MINUTES=30;

/**
 * Evaluate health, persist the rollup baseline, reconcile deduplicated incidents (one open row per competition+classification),
 * dispatch owner alerts on open/escalate/resolve, and apply bounded retention. Runs after every scheduler tick and on owner re-check.
 */
export async function evaluateReliability(db:DatabaseClient,options:{now?:Date;automationEnabled?:boolean;transport?:AlertTransport;alertTo?:string|null;dashboardUrl?:string;source?:string;
  /** Tick-scoped findings (post-refresh integrity) that the stored evidence alone cannot derive. */
  extraIssues?:Array<{competition:string;issue:HealthIssue}>}={}):Promise<EvaluationResult>{
  const now=options.now??new Date();
  const health=await readReliabilityHealth(db,now,{automationEnabled:options.automationEnabled});
  if(health.nativeCoverage)await persistNativeCoverageReport(db,health.nativeCoverage);
  if(health.nativeCoverage)await recordContinuity(db,health.nativeCoverage.at,health.nativeCoverage.cells);
  const result:EvaluationResult={health,opened:0,updated:0,resolved:0,alerts:[]};
  // 1. Rollups (baseline for anomaly detection).
  const rollups=health.competitions.map(c=>({competition:c.competition,health:c.health,issue:c.primary,f24:c.windows['24h'].fixtures,a24:c.windows['24h'].anyOdds,f7:c.windows['7d'].fixtures,a7:c.windows['7d'].anyOdds,mw7:c.windows['7d'].matchWinner,b7:c.windows['7d'].betanoReal,s7:c.windows['7d'].betssonReal,p7:c.windows['7d'].proxyOnly}));
  if(rollups.length)await db.query(`INSERT INTO odds_health_rollups(evaluated_at,competition,health,issue,fixtures_24h,any_24h,fixtures_7d,any_7d,mw_7d,betano_7d,betsson_7d,proxy_7d)
    SELECT $2,competition,health,issue,f24,a24,f7,a7,mw7,b7,s7,p7 FROM jsonb_to_recordset($1::jsonb) AS r(competition text,health text,issue text,f24 int,a24 int,f7 int,a7 int,mw7 int,b7 int,s7 int,p7 int)`,[JSON.stringify(rollups),now.toISOString()]);
  // 2. Incident reconciliation.
  const desired:Array<{competition:string;issue:HealthIssue;health:string}>=[];
  for(const c of health.competitions)for(const issue of c.issues)desired.push({competition:c.competition,issue,health:c.health});
  for(const issue of health.global)desired.push({competition:'*',issue,health:issue.severity==='CRITICAL'?'CRITICAL':'DEGRADED'});
  for(const extra of options.extraIssues??[])if(!desired.some(d=>d.competition===extra.competition&&d.issue.classification===extra.issue.classification))desired.push({competition:extra.competition,issue:extra.issue,health:extra.issue.severity==='CRITICAL'?'CRITICAL':'DEGRADED'});
  const open=(await db.query(`SELECT id,competition,classification,severity,state,alert_severity,alert_channel,alert_sent_at,opened_at,last_seen_at FROM odds_incidents WHERE state<>'RESOLVED'`)).rows;
  const alertTo=options.alertTo===undefined?(process.env.OWNER_ALERT_EMAIL?.trim()||null):options.alertTo;
  const emailReady=alertTo!==null&&(options.transport!==undefined||alertEmailConfigured());
  const transport=options.transport??smtpAlertTransport;
  const dashboardUrl=options.dashboardUrl??'https://livasports.com/owner/health';
  const dispatch=async(kind:'OPENED'|'ESCALATED'|'RESOLVED',incident:{id:string;competition:string;classification:string;severity:'WARNING'|'CRITICAL';affectedFixtures:number;detail:Record<string,unknown>;openedAt:string})=>{
    let channel='DASHBOARD';
    if(emailReady){
      // Atomically lease the delivery, so overlapping owner rechecks/scheduler ticks cannot send duplicates.
      const claim=await db.query(`UPDATE odds_incidents SET alert_sent_at=$2,alert_channel='EMAIL_PENDING' WHERE id=$1 AND
        (alert_sent_at IS NULL OR alert_channel='DASHBOARD' OR alert_sent_at<=$2::timestamptz-interval '30 minutes'
          OR (alert_channel='EMAIL' AND alert_severity IS DISTINCT FROM $3)) RETURNING id`,[incident.id,now.toISOString(),kind==='RESOLVED'?'RESOLVED':incident.severity]);
      if(!claim.rowCount)return;
      try{await transport(alertMessage(kind,incident,dashboardUrl),alertTo!);channel='EMAIL';}catch{channel='EMAIL_FAILED';}
    }
    await db.query(`UPDATE odds_incidents SET alert_sent_at=now(),alert_severity=$2,alert_channel=$3 WHERE id=$1`,[incident.id,kind==='RESOLVED'?'RESOLVED':incident.severity,channel]);
    result.alerts.push({kind,competition:incident.competition,classification:incident.classification,channel});
  };
  for(const d of desired){
    const existing=open.find(o=>o.competition===d.competition&&o.classification===d.issue.classification);
    const detail={evidence:d.issue.evidence,bookmaker:d.issue.bookmaker??null,health:d.health,source:options.source??'scheduler'};
    if(existing){
      const escalated=existing.severity!=='CRITICAL'&&d.issue.severity==='CRITICAL';
      await db.query(`UPDATE odds_incidents SET last_seen_at=$2,severity=CASE WHEN $3 THEN 'CRITICAL' ELSE severity END,affected_fixtures=$4,detail=detail||$5::jsonb WHERE id=$1`,
        [existing.id,now.toISOString(),escalated,d.issue.affectedFixtures,JSON.stringify(detail)]);
      result.updated++;
      const decision=alertDecision({severity:existing.severity,alertSeverity:retryAlertDelivery(existing,now,emailReady)?null:existing.alert_severity,state:existing.state},{severity:escalated?'CRITICAL':existing.severity,state:existing.state});
      if(decision)await dispatch(decision,{id:String(existing.id),competition:d.competition,classification:d.issue.classification,severity:escalated?'CRITICAL':existing.severity,affectedFixtures:d.issue.affectedFixtures,detail,openedAt:existing.opened_at?new Date(existing.opened_at).toISOString():now.toISOString()});
    }else{
      const inserted=await db.query(`INSERT INTO odds_incidents(competition,classification,severity,opened_at,last_seen_at,affected_fixtures,detail)
        VALUES($1,$2,$3,$4,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING RETURNING id,opened_at`,[d.competition,d.issue.classification,d.issue.severity,now.toISOString(),d.issue.affectedFixtures,JSON.stringify(detail)]);
      if(inserted.rowCount){result.opened++;
        const decision=alertDecision(null,{severity:d.issue.severity,state:'OPEN'});
        if(decision)await dispatch(decision,{id:String(inserted.rows[0].id),competition:d.competition,classification:d.issue.classification,severity:d.issue.severity,affectedFixtures:d.issue.affectedFixtures,detail,openedAt:now.toISOString()});
      }
    }
  }
  // A failed resolution notification must also be retryable after the incident leaves the open set.
  if(emailReady){
    const retries=await db.query(`SELECT id,competition,classification,severity,opened_at FROM odds_incidents WHERE state='RESOLVED'
      AND alert_severity IS NOT NULL AND alert_channel IN ('EMAIL_FAILED','EMAIL_PENDING','DASHBOARD')
      AND alert_sent_at<=now()-interval '30 minutes' ORDER BY alert_sent_at LIMIT 5`);
    for(const row of retries.rows)await dispatch('RESOLVED',{id:String(row.id),competition:String(row.competition),classification:String(row.classification),severity:row.severity,
      affectedFixtures:0,detail:{resolution:'Condition cleared; retrying previously undelivered notification'},openedAt:new Date(row.opened_at).toISOString()});
  }
  for(const o of open){
    if(desired.some(d=>d.competition===o.competition&&d.issue.classification===o.classification))continue;
    const competition=health.competitions.find(c=>c.competition===o.competition);
    // Flap guard: a condition must stay clear for a grace window before the incident resolves (an idle competition resolves at once).
    if(competition?.health!=='IDLE'&&now.getTime()-new Date(o.last_seen_at).getTime()<RESOLVE_GRACE_MINUTES*60000)continue;
    const resolution=o.competition==='*'?'Platform condition cleared':competition?.health==='IDLE'?'No fixtures inside 14 days (season window closed)':'Condition cleared by a later evaluation';
    await db.query(`UPDATE odds_incidents SET state='RESOLVED',resolved_at=$2,resolution=$3 WHERE id=$1`,[o.id,now.toISOString(),resolution]);
    result.resolved++;
    const decision=alertDecision({severity:o.severity,alertSeverity:o.alert_severity,state:o.state},{severity:o.severity,state:'RESOLVED'});
    if(decision)await dispatch(decision,{id:String(o.id),competition:o.competition,classification:o.classification,severity:o.severity,affectedFixtures:0,detail:{resolution},openedAt:now.toISOString()});
  }
  // 3. Bounded retention.
  await db.query(`DELETE FROM odds_health_rollups WHERE evaluated_at<now()-($1::int*interval '1 day')`,[ROLLUP_RETENTION_DAYS]);
  await db.query(`DELETE FROM odds_recovery_actions WHERE at<now()-($1::int*interval '1 day')`,[ACTION_RETENTION_DAYS]);
  await db.query(`DELETE FROM odds_incidents WHERE state='RESOLVED' AND resolved_at<now()-($1::int*interval '1 day')`,[INCIDENT_RETENTION_DAYS]);
  try{await pruneLaunchTelemetry(db);}catch{console.warn('[LivaSports] {"event":"telemetry-retention-failed","providerRequests":0}');}
  if(result.opened||result.resolved||result.alerts.length)result.health=await readReliabilityHealth(db,now,{automationEnabled:options.automationEnabled});
  return result;
}

/** Owner acknowledgement: silences nothing, only records that a human has seen the incident. */
export async function acknowledgeIncident(db:QueryExecutor,id:string){
  const r=await db.query(`UPDATE odds_incidents SET state='ACKNOWLEDGED',acknowledged_at=now() WHERE id=$1 AND state='OPEN' RETURNING id`,[id]);
  return r.rowCount===1;
}
