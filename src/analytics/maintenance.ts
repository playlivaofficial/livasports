import type {DatabaseClient} from '@/database/client';

/** Existing protected scheduler only. Bounded expired telemetry cleanup; no sports/auth/favorite/commercial truth is deleted. */
export async function pruneLaunchTelemetry(db:DatabaseClient):Promise<Record<string,number>|null>{
  const claim=await db.query(`INSERT INTO launch_maintenance_runs(name,last_started_at) VALUES('telemetry-retention',now())
    ON CONFLICT(name) DO UPDATE SET last_started_at=now() WHERE launch_maintenance_runs.last_started_at<now()-interval '1 hour' RETURNING name`);
  if(!claim.rowCount)return null;
  const result=await db.transaction(async tx=>{
    await tx.query("SET LOCAL statement_timeout='5s'");
    const events=await tx.query("DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE occurred_at<now()-interval '90 days' ORDER BY occurred_at LIMIT 5000)");
    const sessions=await tx.query("DELETE FROM analytics_sessions WHERE session_id IN (SELECT session_id FROM analytics_sessions WHERE last_seen_at<now()-interval '90 days' ORDER BY last_seen_at LIMIT 5000)");
    const quality=await tx.query("DELETE FROM analytics_ingestion_quality WHERE bucket IN (SELECT bucket FROM analytics_ingestion_quality WHERE bucket<now()-interval '90 days' ORDER BY bucket LIMIT 5000)");
    const emailLimits=await tx.query("DELETE FROM auth_email_login_rate_limits WHERE bucket_hash IN (SELECT bucket_hash FROM auth_email_login_rate_limits WHERE updated_at<now()-interval '1 day' ORDER BY updated_at LIMIT 5000)");
    const requests=await tx.query("DELETE FROM request_rate_limits WHERE bucket_hash IN (SELECT bucket_hash FROM request_rate_limits WHERE expires_at<now()-interval '1 hour' ORDER BY expires_at LIMIT 5000)");
    const tests=await tx.query("DELETE FROM owner_alert_tests WHERE (run_id,phase) IN (SELECT run_id,phase FROM owner_alert_tests WHERE created_at<now()-interval '30 days' ORDER BY created_at LIMIT 5000)");
    return {events:events.rowCount??0,sessions:sessions.rowCount??0,quality:quality.rowCount??0,emailLimits:emailLimits.rowCount??0,requests:requests.rowCount??0,tests:tests.rowCount??0};
  });
  await db.query("UPDATE launch_maintenance_runs SET last_completed_at=now(),result=$1::jsonb WHERE name='telemetry-retention'",[JSON.stringify(result)]);
  return result;
}
