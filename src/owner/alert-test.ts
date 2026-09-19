import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {alertEmailConfigured} from '@/odds/reliability/read';
import {smtpAlertTransport,type AlertTransport} from '@/odds/reliability/alerts';

export type AlertTestPhase='OPENED'|'RESOLVED';
/** Owner-only caller. No arbitrary recipients/copy, no provider call, no fake incident, one drill/hour. */
export async function sendOwnerAlertTest(db:DatabaseClient,runId:string,phase:AlertTestPhase,
  options:{transport?:AlertTransport;to?:string}={}){
  const to=options.to??process.env.OWNER_ALERT_EMAIL?.trim();
  if(!to||(!options.transport&&!alertEmailConfigured()))return {ok:false,code:'ALERT_NOT_CONFIGURED',providerRequests:0};
  const claim=await db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports:owner-alert-test'))");
    const existing=await tx.query('SELECT status FROM owner_alert_tests WHERE run_id=$1 AND phase=$2',[runId,phase]);
    if(existing.rows[0])return String(existing.rows[0].status);
    if(phase==='RESOLVED'){
      const opened=await tx.query("SELECT 1 FROM owner_alert_tests WHERE run_id=$1 AND phase='OPENED' AND status='SENT'",[runId]);
      if(!opened.rowCount)return 'OPEN_REQUIRED';
    }else{
      const recent=await tx.query("SELECT 1 FROM owner_alert_tests WHERE phase='OPENED' AND created_at>now()-interval '1 hour' LIMIT 1");
      if(recent.rowCount)return 'RATE_LIMITED';
    }
    await tx.query("INSERT INTO owner_alert_tests(run_id,phase,status) VALUES($1,$2,'PENDING')",[runId,phase]);
    return 'CLAIMED';
  });
  if(claim!=='CLAIMED')return {ok:claim==='SENT',code:claim==='SENT'?'ALREADY_SENT':claim,providerRequests:0};
  let sent=false;
  try{
    await (options.transport??smtpAlertTransport)({subject:`[LivaSports TEST] Owner alert ${phase==='OPENED'?'delivery check':'resolution check'}`,
      text:`INTERNAL TEST ONLY — not a real odds outage.\n\nTest: ${runId}\nPhase: ${phase}\nThe ${phase==='OPENED'?'alert delivery':'resolution notification'} path is being verified. No public incident, provider request, deposit or conversion was created.\nDashboard: https://livasports.com/owner/health\n`},to);
    sent=true;
  }catch{/* Never return SMTP credentials/response bodies. */}
  await db.query('UPDATE owner_alert_tests SET status=$3,completed_at=now() WHERE run_id=$1 AND phase=$2',[runId,phase,sent?'SENT':'FAILED']);
  return {ok:sent,code:sent?'SENT':'SEND_FAILED',providerRequests:0};
}
