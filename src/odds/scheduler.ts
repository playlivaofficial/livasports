import type {DatabaseClient} from '@/database/client';
import {M5OddsPapiAdapter} from '@/providers/oddspapi/M5OddsPapiAdapter';
import {verifyCatalog} from '@/providers/oddspapi/m5-normalizer';
import {catalogNeedsExpansion,mergeCatalogTournaments,schedulerTournaments,isStableOddsTournament,unmatchedCatalogRows,type CatalogTournament} from '@/providers/oddspapi/tournament-catalog';
import {COVERAGE_DISCOVERY_REQUEST_CAP} from '@/providers/oddspapi/request-limits';
import {canonicalFixtures,persistSnapshot,startOddsJob} from './ingestion';
import {budgetHealth,OddsBudgetStopped,reconcileAccountPeriod} from './budget';
import {LIVE_ODDS_CAPABILITY} from './live-capability';
import {readBookmakerCoverageHealth} from './bookmaker-coverage-health';
import {readCoverageHealth} from './coverage-health';
import {isProviderFixtureAbsent} from './canary';
import {planScheduler,SCHEDULER_BOOKMAKERS,SCHEDULER_TICK_MINUTES,type RefreshTarget} from './scheduler-policy';
import {evaluateReliability,logRecoveryAction} from './reliability/incidents';
import {persistCatalogRows} from './reliability/catalog';
import {HEALTH_CONTRACT_VERSION,type IssueClassification,type Severity} from './reliability/model';
import {readReliabilityHealth} from './reliability/read';
import type {OddsSnapshot} from './types';
import {recoverNativeIdentities} from './native-recovery';
import {backoffJitterMinutes,classifyBackoff} from './backoff-policy';
import {claimRefreshTargets,reconcileRefreshQueue,releaseRefreshTargets} from './refresh-queue';

export interface IntegrityFinding {bookmaker:string;tournamentIds:string[];classification:IssueClassification;severity:Severity;reason:string;returnedFixtures:number;matchedFixtures:number;quotes:number;currentWrites:number;closed:number;}
/** P3 §14: flag a "successful" refresh whose outcome is suspicious. Provider truth is never rolled back automatically. */
export function integrityCheck(input:{bookmaker:string;tournamentIds:readonly string[];returnedFixtures:number;matchedFixtures:number;quotes:number;currentWrites:number;closed:number;rejected?:unknown}):IntegrityFinding|null{
  const base={bookmaker:input.bookmaker,tournamentIds:[...input.tournamentIds],returnedFixtures:input.returnedFixtures,matchedFixtures:input.matchedFixtures,quotes:input.quotes,currentWrites:input.currentWrites,closed:input.closed};
  const rejected=Array.isArray(input.rejected)?input.rejected.length:0;
  if(input.returnedFixtures>0&&input.matchedFixtures===0)return {...base,classification:'MAPPING_FAILED',severity:'CRITICAL',reason:`Provider returned ${input.returnedFixtures} fixture(s) but none mapped to a LivaSports fixture`};
  if(input.matchedFixtures>0&&input.quotes===0)return {...base,classification:'NORMALIZATION_REJECTED',severity:'CRITICAL',reason:`${input.matchedFixtures} matched fixture(s) produced zero normalized quotes${rejected?` (${rejected} rejected)`:''}`};
  if(input.closed>=10&&input.closed>input.currentWrites*3)return {...base,classification:'PROVIDER_NOT_OFFERED',severity:'WARNING',reason:`Feed closed ${input.closed} quotes while writing ${input.currentWrites} (mass close)`};
  return null;
}
async function catalogRowsStale(db:DatabaseClient){
  try{const r=await db.query("SELECT max(reconciled_at) AS at FROM odds_catalog_rows");return !r.rows[0]?.at||Date.now()-new Date(r.rows[0].at).getTime()>6*3600000;}catch{return false;}
}

export type SchedulerState='READY'|'RUNNING'|'SUCCEEDED'|'PARTIAL'|'FAILED'|'BUDGET_STOPPED';
/** Bounded replays of a saved provider response before it is quarantined (a poison snapshot blocked every tick for hours in production). */
export const SNAPSHOT_REPLAY_LIMIT=3;
export function safeSchedulerError(error:unknown):string {
  if(error instanceof OddsBudgetStopped)return error.code;
  const message=error instanceof Error?error.message:'';
  if(message.startsWith('ODDSPAPI_NETWORK_ERROR'))return 'ODDS_NETWORK_ERROR';
  if(/^ODDS_[A-Z_]+$/.test(message))return message;
  try{const e=JSON.parse(message);if(Number.isInteger(e.status))return `ODDSPAPI_HTTP_${e.status}`;}catch{/* Only allowlisted codes are persisted. */}
  return 'ODDS_REFRESH_FAILED';
}
export async function schedulerInputs(db:DatabaseClient,tournaments:readonly CatalogTournament[]=[]){
  const [budget,fixtures,records]=await Promise.all([budgetHealth(db),canonicalFixtures(db),db.query(`SELECT b.provider_slug,
    EXISTS(SELECT 1 FROM bookmaker_geo_availability g WHERE g.bookmaker_id=b.id AND g.odds_enabled AND g.comparison_enabled
      AND g.verified_at IS NOT NULL AND g.verification_state IN ('VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX')) AS public_eligible,
    t.tournament_id,t.last_success_at,t.last_attempt_at,t.last_checked_at,t.pending_since,t.retry_after,t.consecutive_failures,t.last_error,
    t.failure_class,t.backoff_reason,t.next_recheck_at,t.failure_evidence,t.last_outcome,
    EXISTS(SELECT 1 FROM odds_current legacy JOIN fixtures lf ON lf.id=legacy.fixture_id
      JOIN provider_entity_mappings lm ON lm.provider='ODDSPAPI' AND lm.entity_type='COMPETITION' AND lm.livasports_entity_id=lf.competition_id
      WHERE lm.provider_entity_id=t.tournament_id AND legacy.bookmaker_id=b.id AND legacy.status='ACTIVE'
        AND legacy.freshness_ttl_minutes IS NULL AND lf.status='SCHEDULED' AND lf.kickoff>now()) AS needs_cadence_refresh,
    EXISTS(SELECT 1 FROM odds_current o JOIN fixtures f ON f.id=o.fixture_id
      JOIN provider_entity_mappings m ON m.entity_type='COMPETITION' AND m.provider='ODDSPAPI' AND m.livasports_entity_id=f.competition_id
      WHERE m.provider_entity_id=t.tournament_id AND o.bookmaker_id=b.id AND o.status='ACTIVE' AND o.phase='PREGAME'
        AND o.scope='FULL_TIME_REGULATION' AND o.freshness_ttl_minutes>0
        AND o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now()
        AND o.provider_kickoff IS NOT NULL AND abs(extract(epoch FROM (f.kickoff-o.provider_kickoff)))<=600
        AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '7 days') AS useful_coverage
    FROM bookmakers b LEFT JOIN odds_refresh_targets t ON t.bookmaker=b.provider_slug WHERE b.enabled AND b.provider_slug=ANY($1::text[])`,[SCHEDULER_BOOKMAKERS])]);
  const catalog=tournaments.length?tournaments:schedulerTournaments([]);
  const native=(await db.query(`SELECT b.provider_slug,m.provider_entity_id AS tournament_id,
    min(LEAST(o.observed_at,o.last_successful_refresh_at)+o.freshness_ttl_minutes*interval '1 minute') AS expiry
    FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id JOIN fixtures f ON f.id=o.fixture_id
    JOIN provider_entity_mappings m ON m.provider='ODDSPAPI' AND m.entity_type='COMPETITION' AND m.livasports_entity_id=f.competition_id
    LEFT JOIN odds_refresh_targets rt ON rt.bookmaker=b.provider_slug AND rt.tournament_id=m.provider_entity_id
    WHERE o.status='ACTIVE' AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION' AND o.freshness_ttl_minutes>0
      AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '7 days'
      AND (o.observed_at>now()-interval '2 days' OR LEAST(o.observed_at,o.last_successful_refresh_at)+o.freshness_ttl_minutes*interval '1 minute'>now())
      AND abs(extract(epoch FROM(f.kickoff-o.provider_kickoff)))<=600
      AND o.observed_at>=COALESCE(rt.last_success_at,o.observed_at)-interval '1 second'
    GROUP BY b.provider_slug,m.provider_entity_id`)).rows;
  const support=(await db.query("SELECT bookmaker,tournament_id FROM odds_target_support WHERE provider='ODDSPAPI' AND state='UNSUPPORTED'")).rows;
  const latestNative=await db.query("SELECT report FROM odds_native_rollups WHERE bucket>now()-interval '2 hours' ORDER BY bucket DESC LIMIT 1");
  const nativeGroups=(latestNative.rows[0]?.report?.groups??[]) as Array<{bookmaker:string;competition:string;fallback:number;reasons:Record<string,number>}>;
  const targets:RefreshTarget[]=SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>catalog.map(t=>{
    const row=records.rows.find(r=>r.provider_slug===bookmaker&&r.tournament_id===t.id);
    const source=records.rows.find(r=>r.provider_slug===bookmaker);
    const expiry=native.find(r=>r.provider_slug===bookmaker&&r.tournament_id===t.id)?.expiry;
    const gaps=nativeGroups.filter(g=>g.bookmaker===bookmaker&&g.competition===t.canonical);
    // Reorder only already-due requests. Known provider gaps do not earn extra polling; cadence/caps/backoff are unchanged.
    const nativePriority=bookmaker==='betano.bet.br'?0:gaps.reduce((n,g)=>n+Math.max(0,g.fallback-(g.reasons.PROVIDER_GAP??0))+(g.reasons.STALE_OR_EXPIRED??0)+(g.reasons.INGESTION_BUG??0),0);
    return {bookmaker,tournamentId:t.id,nativePriority,nativeExpiryAt:expiry?.toISOString()??null,recentNative:!!expiry,
      unsupported:support.some(r=>r.bookmaker===bookmaker&&r.tournament_id===t.id),
      // Re-fetching the same unmappable payload cannot repair identity/configuration. Saved-response
      // recovery still runs without provider spend; verified persistence clears this block.
      mappingBlocked:['MAPPING_EMPTY','PARSER_EMPTY'].includes(row?.last_outcome)||['MAPPING','MARKET'].includes(row?.failure_class),
      catalogEmpty:t.catalogEmpty===true&&row?.last_error==='ODDSPAPI_HTTP_404'&&!row?.last_success_at,
      fixtures:source?fixtures.filter(f=>f.competition===t.canonical):[],publicEligible:source?.public_eligible===true,
      hasUsefulCoverage:row?.useful_coverage===true,lastSuccessAt:row?.last_success_at?.toISOString()??null,retryAfter:row?.retry_after?.toISOString()??null,
      lastError:typeof row?.last_error==='string'?row.last_error:null,needsCadenceRefresh:row?.needs_cadence_refresh===true,
      lastAttemptAt:row?.last_attempt_at?.toISOString?.()??null,consecutiveFailures:Number(row?.consecutive_failures??0),
      lastCheckedAt:row?.last_checked_at?.toISOString?.()??null,pendingSince:row?.pending_since?.toISOString?.()??null,
      failureClass:row?.failure_class??null,backoffReason:row?.backoff_reason??null,nextRecheckAt:row?.next_recheck_at?.toISOString?.()??null};
  }));
  return {targets,budget};
}
export async function schedulerPlan(db:DatabaseClient,now=new Date(),tournaments:readonly CatalogTournament[]=[]){const {targets,budget}=await schedulerInputs(db,tournaments);return planScheduler(targets,now,budget);}
async function recordDecision(db:DatabaseClient,job:string,bookmaker:string|null,ids:string[],decision:string){
  await db.query(`UPDATE odds_scheduler_decisions SET targets=(SELECT jsonb_agg(CASE
    WHEN t->>'decision'='SELECTED' AND ($2::text IS NULL OR (t->>'bookmaker'=$2 AND t->>'tournamentId'=ANY($3::text[])))
    THEN t||jsonb_build_object('decision',$4::text) ELSE t END) FROM jsonb_array_elements(targets) t) WHERE job_id=$1`,[job,bookmaker,ids,decision]);
}
export function schedulerDeferral(code:string|null){
  if(code==='ODDS_UPSTREAM_COOLDOWN')return 'CIRCUIT_BREAKER';
  if(code==='ODDS_DUPLICATE_OR_FAILED_TARGET_COOLDOWN')return 'TARGET_DEDUP_OR_CLIENT_ERROR_COOLDOWN';
  if(code==='ACCOUNT_RECONCILIATION_COOLDOWN')return 'ACCOUNT_RECONCILIATION_COOLDOWN';
  if(code?.startsWith('ACCOUNT_')||code==='ODDS_WORKER_LEASE_LOST')return 'MANUAL_PROTECTION';
  if(code==='ODDS_RUN_CAP_REACHED'||code==='ODDS_RUN_DEADLINE')return 'DEFERRED_BY_PRIORITY';
  if(code&&/HTTP_5\d\d$/.test(code))return 'HTTP_5XX_TRANSIENT';
  if(code&&/401|403/.test(code))return 'AUTH_REJECTED';
  if(code&&/BUDGET|QUOTA|429|EXHAUSTED/.test(code))return 'DEFERRED_BY_DAILY_BUDGET';
  if(code&&/HTTP_404$/.test(code))return 'HTTP_404_TARGET_NOT_FOUND';
  if(code&&/HTTP_4\d\d$/.test(code))return 'TARGET_SPECIFIC_COOLDOWN';
  if(code)return 'REFRESH_FAILED';
  return 'DEFERRED_BY_PRIORITY';
}
async function persistCatalogCompetitionMappings(db:DatabaseClient,tournaments:readonly CatalogTournament[]){
  if(!tournaments.length)return;
  await db.query(`INSERT INTO provider_entity_mappings(provider,entity_type,provider_entity_id,livasports_entity_id,metadata)
    SELECT 'ODDSPAPI','COMPETITION',t.id,c.id,jsonb_build_object('canonical',t.canonical,'slug',t.slug,'category',t.category)
    FROM jsonb_to_recordset($1::jsonb) AS t(id text, slug text, category text, canonical text)
    JOIN competitions c ON c.slug=t.canonical AND c.enabled
    ON CONFLICT DO NOTHING`,[JSON.stringify(tournaments)]);
}
export async function runOddsScheduler(db:DatabaseClient,key:string,trigger:'CONTROLLED'|'AUTOMATIC'='CONTROLLED'){
  const job=await startOddsJob(db);const started=Date.now();
  // Durable target backoff replaces immediate automatic retries; one failing upstream cannot consume the run.
  const provider=new M5OddsPapiAdapter(db,key,job,6,true,started+140000,undefined,0);
  let state:SchedulerState='SUCCEEDED';let errorCode:string|null=null;
  const results:Array<Record<string,unknown>>=[];let recovered=0;let catalogExpanded=false;const integrity:IntegrityFinding[]=[];
  let tournaments:CatalogTournament[]=schedulerTournaments([]);
  try{
    await db.query("UPDATE odds_sync_jobs SET trigger_source=$2 WHERE id=$1",[job,trigger]);
    await db.query(`UPDATE odds_scheduler_health SET state='RUNNING',last_job_id=$1,updated_at=now(),
      last_automatic_invocation_at=CASE WHEN $2 THEN now() ELSE last_automatic_invocation_at END WHERE id=true`,[job,trigger==='AUTOMATIC']);
    const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
    if(!catalog)throw new Error('ODDS_CATALOG_UNVERIFIED');verifyCatalog(catalog.markets,catalog.tournaments);
    provider.setMarketCatalog(catalog.markets);
    tournaments=schedulerTournaments(catalog.tournaments);
    // P0 incident: a competition that is enabled, has upcoming fixtures and no catalog row must not wait for a manual
    // discovery run. One bounded /v4/tournaments call per 24h merges new provider rows (IDs are never invented).
    const upcoming=[...new Set((await canonicalFixtures(db)).filter(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>started&&Date.parse(f.kickoff)<started+14*86400000).map(f=>f.competition))];
    if(catalogNeedsExpansion(catalog.tournaments,upcoming)||tournaments.some(t=>t.catalogEmpty&&upcoming.includes(t.canonical))){
      const recent=await db.query("SELECT 1 FROM odds_provider_requests WHERE endpoint='/v4/tournaments' AND started_at>now()-interval '24 hours' LIMIT 1");
      const health=await budgetHealth(db);
      if(!recent.rowCount&&health.verified&&Number(health.safeRemaining)>=COVERAGE_DISCOVERY_REQUEST_CAP){
        try{
          const data=await provider.providerTournaments();
          if(Array.isArray(data)){
            const merged=mergeCatalogTournaments(catalog.tournaments,data);
            await db.query("UPDATE odds_provider_catalog SET tournaments=$1::jsonb,verified_at=now() WHERE provider='ODDSPAPI'",[JSON.stringify(merged)]);
            catalogExpanded=true;tournaments=schedulerTournaments(merged);
            await logRecoveryAction(db,{trigger:'SCHEDULER',action:'CATALOG_EXPANSION',reason:'Daily catalog discovery: missing or explicitly empty upcoming competition',requestCost:1,outcome:'SUCCEEDED',detail:{storedRows:merged.length,scheduled:tournaments.length}});
          }
        }catch(error){if(error instanceof OddsBudgetStopped)throw error;/* discovery failure never blocks the routine refresh */}
      }
    }
    provider.setCatalog(tournaments);
    await persistCatalogCompetitionMappings(db,tournaments);
    let replayed=0;const pending=(await db.query('SELECT id,payload,replay_failures FROM odds_sync_snapshots WHERE applied_at IS NULL AND quarantined_at IS NULL ORDER BY observed_at LIMIT 3')).rows;
    for(const row of pending){
      // A saved response that cannot be persisted must not poison every later tick: bounded replays, then quarantine + incident.
      // persistSnapshot marks the row whose id is the hash of the payload it receives; a payload that round-trips
      // through jsonb can hash differently, so the replayed row is cleared by its own id or it stays pending forever.
      try{await persistSnapshot(db,job,row.payload as OddsSnapshot);recovered++;replayed++;
        await db.query('UPDATE odds_sync_snapshots SET applied_at=COALESCE(applied_at,now()) WHERE id=$1',[row.id]);}
      catch(error){
        if(error instanceof OddsBudgetStopped||safeSchedulerError(error)==='ODDS_WORKER_LEASE_LOST')throw error;
        const failures=Number(row.replay_failures??0)+1;const quarantine=failures>=SNAPSHOT_REPLAY_LIMIT;
        const message=(error instanceof Error?error.message:'REPLAY_FAILED').replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]').slice(0,200);
        await db.query(`UPDATE odds_sync_snapshots SET replay_failures=$2,replay_error=$3,quarantined_at=CASE WHEN $4 THEN now() ELSE quarantined_at END WHERE id=$1`,[row.id,failures,message,quarantine]);
        await logRecoveryAction(db,{trigger:'INTEGRITY',action:quarantine?'SNAPSHOT_QUARANTINED':'SNAPSHOT_REPLAY_FAILED',bookmaker:(row.payload as OddsSnapshot).bookmaker,
          tournamentId:((row.payload as OddsSnapshot).tournamentIds??[]).join(','),reason:message,outcome:quarantine?'QUARANTINED':`RETRY_${failures}_OF_${SNAPSHOT_REPLAY_LIMIT}`,detail:{snapshotId:row.id,failures}});
        if(quarantine)integrity.push({bookmaker:(row.payload as OddsSnapshot).bookmaker,tournamentIds:[...((row.payload as OddsSnapshot).tournamentIds??[])],classification:'STORE_WRITE_FAILED',severity:'CRITICAL',
          reason:`Saved response could not be persisted after ${failures} replays: ${message}`,returnedFixtures:(row.payload as OddsSnapshot).fixtures?.length??0,matchedFixtures:0,quotes:(row.payload as OddsSnapshot).quotes?.length??0,currentWrites:0,closed:0});
      }
    }
    recovered+=(await recoverNativeIdentities(db,job)).repaired;
    if(replayed===SNAPSHOT_REPLAY_LIMIT)throw new Error('ODDS_RECOVERY_PENDING');
    if(!(await budgetHealth(db)).verified)await reconcileAccountPeriod(db,await provider.accountPeriod());
    const plan=await schedulerPlan(db,new Date(),tournaments);
    await reconcileRefreshQueue(db,plan);
    await db.query(`INSERT INTO odds_scheduler_decisions(job_id,targets,budget) VALUES($1,$2::jsonb,$3::jsonb)
      ON CONFLICT(job_id) DO NOTHING`,[job,JSON.stringify(plan.targets.map(t=>({...t,decision:t.delayReason??(t.intervalMinutes===null?'NO_ELIGIBLE_FIXTURES':
        !t.due?'NOT_DUE':plan.batches.some(b=>b.bookmaker===t.bookmaker&&b.tournamentIds.includes(t.tournamentId))?'SELECTED':
        plan.pacing.headroom===0||!plan.cadence.budgetAvailable?'DEFERRED_BY_DAILY_BUDGET':'DEFERRED_BY_PRIORITY')}))),JSON.stringify(plan.pacing)]);
    if(!plan.cadence.budgetAvailable&&plan.targets.some(t=>t.fixtures>0))throw new OddsBudgetStopped('ODDS_BUDGET_UNVERIFIED_OR_EXHAUSTED');
    await db.query('UPDATE odds_scheduler_health SET last_discovery_at=now(),fixtures_considered=$1,next_due_at=$2 WHERE id=true',
      [plan.targets.filter(t=>t.bookmaker==='betano.bet.br').reduce((n,t)=>n+t.fixtures,0),plan.nextDueAt]);
    if(plan.batches.length){
      const fresh=await db.query("SELECT 1 FROM odds_budget_baselines WHERE now()>=period_start AND now()<period_end AND reconciliation_at>now()-interval '24 hours'");
      if(!fresh.rowCount)await reconcileAccountPeriod(db,await provider.accountPeriod());
      for(const batch of plan.batches){
        const current=await schedulerPlan(db,new Date(),tournaments);
        const ids=current.batches.find(b=>b.bookmaker===batch.bookmaker&&b.tournamentIds.some(id=>batch.tournamentIds.includes(id)))?.tournamentIds??[];
        if(!ids.length)continue;
        try{
          await claimRefreshTargets(db,job,batch.bookmaker,ids);
          const snapshot={...await provider.snapshot(batch.bookmaker,ids),cadenceScale:current.cadence.scale};
          const saved=await persistSnapshot(db,job,snapshot);
          for(const outcome of saved.outcomes)await recordDecision(db,job,batch.bookmaker,[outcome.tournamentId],outcome.outcome);
          if(saved.outcomes.some(o=>!o.meaningful))state='PARTIAL';
          if(batch.rescue){
            const after=await schedulerInputs(db,tournaments);
            const rescued=current.targets.filter(t=>t.bookmaker===batch.bookmaker&&ids.includes(t.tournamentId)&&t.rescue);
            const fresh=rescued.filter(t=>after.targets.some(a=>a.bookmaker===t.bookmaker&&a.tournamentId===t.tournamentId&&a.hasUsefulCoverage));
            const beforeExpiry=fresh.filter(t=>Date.parse(t.nativeExpiryAt??'')>Date.parse(snapshot.observedAt));
            await logRecoveryAction(db,{trigger:'SCHEDULER',action:'NATIVE_RESCUE',bookmaker:batch.bookmaker,tournamentId:ids.join(','),reason:'Persisted native expiry deadline',requestCost:1,
              outcome:fresh.length===rescued.length&&fresh.length?'SUCCEEDED':'NO_NATIVE_RECOVERY',detail:{observedAt:snapshot.observedAt,currentWrites:saved.current_writes,targets:rescued.length,freshTargets:fresh.length,beforeExpiry:beforeExpiry.length}});
          }
          results.push({bookmaker:batch.bookmaker,tournamentIds:ids,returnedFixtures:saved.returnedFixtures,matchedFixtures:saved.matchedFixtures,
            quotes:saved.quotes,outcomes:saved.outcomes,verifiedRefresh:saved.outcomes.some(o=>o.meaningful),historyChanges:saved.history_changes,currentWrites:saved.current_writes,closed:saved.closed,observedAt:snapshot.observedAt,cadence:current.cadence});
          // P3 §14 post-refresh integrity: a successful response that yields nothing usable is suspicious, never silent.
          const check=integrityCheck({bookmaker:batch.bookmaker,tournamentIds:ids,returnedFixtures:saved.returnedFixtures,matchedFixtures:saved.matchedFixtures,quotes:saved.quotes,currentWrites:saved.current_writes,closed:saved.closed??0,rejected:saved.rejected});
          if(check){integrity.push(check);await logRecoveryAction(db,{trigger:'INTEGRITY',action:'POST_REFRESH_CHECK',bookmaker:batch.bookmaker,tournamentId:ids.join(','),competition:tournaments.find(t=>t.id===ids[0])?.canonical??null,reason:check.reason,requestCost:0,outcome:check.classification,detail:{...check}});}
          // P3 §22: urgent/recovery batches are self-healing actions and stay explainable.
          if(batch.urgent)await logRecoveryAction(db,{trigger:'SCHEDULER',action:'URGENT_REFRESH',bookmaker:batch.bookmaker,tournamentId:ids.join(','),competition:tournaments.find(t=>t.id===ids[0])?.canonical??null,
            reason:`Urgent batch (nearest kickoff ${Math.round(batch.nearestHours*10)/10}h)`,requestCost:1,outcome:saved.outcomes.every(o=>o.meaningful)?'VERIFIED':'PARTIAL',budgetRemainingAfter:current.pacing.headroom===null?null:Math.max(0,current.pacing.headroom-1),detail:{quotes:saved.quotes,matchedFixtures:saved.matchedFixtures,outcomes:saved.outcomes}});
        }catch(error){
          await recordDecision(db,job,batch.bookmaker,ids,schedulerDeferral(safeSchedulerError(error)));
          if(batch.rescue)await logRecoveryAction(db,{trigger:'SCHEDULER',action:'NATIVE_RESCUE',bookmaker:batch.bookmaker,tournamentId:ids.join(','),reason:'Persisted native expiry deadline',requestCost:error instanceof OddsBudgetStopped?0:1,outcome:safeSchedulerError(error)});
          // A ledger stop is not a feed failure: leave target retry state untouched so proven feeds keep sharing requests.
          if(error instanceof OddsBudgetStopped){errorCode=error.code;state='BUDGET_STOPPED';
            await logRecoveryAction(db,{trigger:'SCHEDULER',action:'BUDGET_STOP',bookmaker:batch.bookmaker,tournamentId:ids.join(','),reason:error.code,outcome:'DEFERRED',nextRetryAt:new Date(Date.now()+SCHEDULER_TICK_MINUTES*60000).toISOString(),budgetRemainingAfter:0});break;}
          if(batch.urgent)await logRecoveryAction(db,{trigger:'SCHEDULER',action:'URGENT_REFRESH',bookmaker:batch.bookmaker,tournamentId:ids.join(','),competition:tournaments.find(t=>t.id===ids[0])?.canonical??null,
            reason:`Urgent batch (nearest kickoff ${Math.round(batch.nearestHours*10)/10}h)`,requestCost:1,outcome:safeSchedulerError(error)});
          const isolatedEmpty=isProviderFixtureAbsent(error)&&ids.length===1&&!isStableOddsTournament(ids[0]);
          if(!isolatedEmpty)errorCode=safeSchedulerError(error);
          // Hard target failures remain isolated; transient failures use a short bounded ladder and deterministic jitter.
          const neverSucceeded=!current.targets.some(t=>t.bookmaker===batch.bookmaker&&ids.includes(t.tournamentId)&&t.lastSuccessAt);
          const persistable=ids.filter(id=>tournaments.some(tournament=>tournament.id===id));
          if(persistable.length){
            try{
              const prior=Math.max(0,...current.targets.filter(t=>t.bookmaker===batch.bookmaker&&ids.includes(t.tournamentId)).map(t=>t.consecutiveFailures??0));
              const failureCode=isolatedEmpty?'ODDSPAPI_HTTP_404':(errorCode??safeSchedulerError(error));
              const failure=classifyBackoff({code:failureCode,neverSucceeded,isolated:ids.length===1,
                catalogEmpty:ids.some(id=>tournaments.find(t=>t.id===id)?.catalogEmpty===true),
                fixtures:current.targets.filter(t=>t.bookmaker===batch.bookmaker&&ids.includes(t.tournamentId)).reduce((n,t)=>n+t.fixtures,0),consecutiveFailures:prior+1});
              const delay=failure.delayMinutes+Math.max(...persistable.map(id=>backoffJitterMinutes(batch.bookmaker,id)));
              await db.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,last_attempt_at,retry_after,consecutive_failures,last_error,failure_class,backoff_reason,next_recheck_at,failure_evidence)
                SELECT $1,unnest($2::text[]),now(),now()+$4*interval '1 minute',1,$3,$5,$6,now()+$4*interval '1 minute',$7::jsonb
                ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET last_attempt_at=now(),last_error=$3,
                  consecutive_failures=LEAST(odds_refresh_targets.consecutive_failures+1,10),
                  retry_after=now()+$4*interval '1 minute',failure_class=$5,backoff_reason=$6,
                  next_recheck_at=now()+$4*interval '1 minute',failure_evidence=$7::jsonb`,
                [batch.bookmaker,persistable,failureCode,delay,failure.failureClass,failure.subreason,JSON.stringify(failure.evidence)]);
            }catch{state='FAILED';errorCode='ODDS_RETRY_STATE_WRITE_FAILED';break;}
          }
          if(!isolatedEmpty)state=results.length?'PARTIAL':'FAILED';
          // Account-wide outage/auth/rate-limit: stop this tick, do not fan out to other feeds.
          if(errorCode==='ODDSPAPI_HTTP_429'||errorCode==='ODDSPAPI_HTTP_401'||errorCode==='ODDSPAPI_HTTP_403'||/^ODDSPAPI_HTTP_5\d\d$/.test(errorCode??'')||errorCode==='ODDS_RUN_CAP_REACHED'||errorCode==='ODDS_RUN_DEADLINE')break;
        }
      }
      if(state==='FAILED'&&results.length)state='PARTIAL';
    }
  }catch(error){errorCode=safeSchedulerError(error);state=error instanceof OddsBudgetStopped?'BUDGET_STOPPED':results.length?'PARTIAL':'FAILED';}
  await releaseRefreshTargets(db,job);
  await recordDecision(db,job,null,[],schedulerDeferral(errorCode));
  const next=await schedulerPlan(db,new Date(),tournaments).catch(()=>null);
  if(next)await reconcileRefreshQueue(db,next);
  // P3 reliability evaluation after every tick: rollups, deduplicated incidents, owner alerts. Never breaks the refresh path.
  let reliability:Record<string,unknown>|null=null;
  try{
    if(catalogExpanded||await catalogRowsStale(db))await persistCatalogRows(db,(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.tournaments??[]);
    const evaluation=await evaluateReliability(db,{automationEnabled:trigger==='AUTOMATIC'?true:undefined,source:'scheduler',
      extraIssues:integrity.map(i=>({competition:tournaments.find(t=>t.id===i.tournamentIds[0])?.canonical??'*',issue:{classification:i.classification,severity:i.severity,evidence:i.reason,affectedFixtures:i.returnedFixtures,bookmaker:i.bookmaker}}))});
    reliability={overall:evaluation.health.overall,opened:evaluation.opened,resolved:evaluation.resolved,alerts:evaluation.alerts,counts:evaluation.health.counts};
  }catch(error){reliability={error:safeSchedulerError(error)};}
  const controlPlaneState=state;
  const dataPlaneState=reliability?.error?'UNKNOWN':reliability?.overall??'UNKNOWN';
  if(state==='SUCCEEDED'&&!['HEALTHY','IDLE'].includes(String(dataPlaneState)))state='PARTIAL';
  const result={jobId:job,trigger,state,controlPlaneState,dataPlaneState,requests:provider.requestCount(),recovered,catalogExpanded,feeds:results,error:errorCode,nextDueAt:next?.nextDueAt??null,pacing:next?.pacing??null,integrity,reliability:reliability as Record<string,unknown>|null};
  await db.transaction(async tx=>{
    await tx.query("UPDATE odds_sync_jobs SET status=$2,completed_at=now(),error_code=$3,result=$4::jsonb WHERE id=$1 AND status='RUNNING'",[job,state,errorCode,JSON.stringify(result)]);
    await tx.query(`UPDATE odds_scheduler_health SET state=$1,last_error=CASE WHEN $1='SUCCEEDED' THEN NULL WHEN $2::text IS NOT NULL OR $5 THEN $2::text ELSE last_error END,
      feeds_refreshed=CASE WHEN $5 THEN $3::jsonb ELSE feeds_refreshed END,next_due_at=$4,updated_at=now(),
      last_refresh_at=CASE WHEN $5 THEN now() ELSE last_refresh_at END,
      last_automatic_refresh_at=CASE WHEN $5 AND $6 THEN now() ELSE last_automatic_refresh_at END WHERE id=true`,
      [state,errorCode,JSON.stringify(results.filter(r=>r.verifiedRefresh).map(r=>r.bookmaker)),next?.nextDueAt??null,results.some(r=>r.verifiedRefresh),trigger==='AUTOMATIC']);
  });
  return result;
}
export async function schedulerHealth(db:DatabaseClient,automationConfigured=false){
  const [budget,status,lease,feeds,bookmakerHealth,coverage,catalog,reliability]=await Promise.all([budgetHealth(db),db.query('SELECT * FROM odds_scheduler_health WHERE id=true'),
    db.query("SELECT status,heartbeat_at,lease_expires_at,provider_requests FROM odds_sync_jobs WHERE status='RUNNING' ORDER BY started_at DESC LIMIT 1"),
    db.query('SELECT bookmaker,tournament_id,last_success_at,retry_after,consecutive_failures,last_error FROM odds_refresh_targets ORDER BY bookmaker,tournament_id'),
    readBookmakerCoverageHealth(db),readCoverageHealth(db).catch(error=>({state:'unknown' as const,error:safeSchedulerError(error)})),
    db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'").catch(()=>({rows:[]})),
    readReliabilityHealth(db,new Date(),{automationEnabled:automationConfigured}).catch(error=>({error:safeSchedulerError(error)}))]);
  const row=status.rows[0];
  const healthyAutomatic=automationConfigured&&row?.last_automatic_invocation_at&&Date.now()-row.last_automatic_invocation_at.getTime()<10*60000
    &&!['FAILED','BUDGET_STOPPED'].includes(row.state);
  return {version:HEALTH_CONTRACT_VERSION,automationEnabled:automationConfigured,automationOperational:Boolean(healthyAutomatic),infrastructure:automationConfigured?'CONFIGURED_EXTERNAL_SCHEDULER':'NONE',
    state:row?.state??'READY',lastDiscoveryAt:row?.last_discovery_at??null,lastSuccessfulRefreshAt:row?.last_refresh_at??null,
    lastSuccessfulAutomatedRefreshAt:row?.last_automatic_refresh_at??null,lastAutomaticInvocationAt:row?.last_automatic_invocation_at??null,
    nextExpectedRun:automationConfigured?row?.next_due_at??null:null,
    nextPolicyDueAt:row?.next_due_at??null,fixturesConsidered:row?.fixtures_considered??0,feedsRefreshed:row?.feeds_refreshed??[],
    lastError:row?.last_error??null,activeLease:lease.rows[0]??null,feedStatus:feeds.rows,budget,providerRequests:0,
    liveOdds:LIVE_ODDS_CAPABILITY,bookmakerHealth,coverage,
    scheduledTournaments:schedulerTournaments((catalog.rows[0]?.tournaments as unknown[])??[]).map(t=>({id:t.id,canonical:t.canonical})),
    unmatchedCatalogRows:unmatchedCatalogRows((catalog.rows[0]?.tournaments as unknown[])??[]),reliability};
}
