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
import {planScheduler,SCHEDULER_BOOKMAKERS,type RefreshTarget} from './scheduler-policy';
import type {OddsSnapshot} from './types';

export type SchedulerState='READY'|'RUNNING'|'SUCCEEDED'|'PARTIAL'|'FAILED'|'BUDGET_STOPPED';
export function safeSchedulerError(error:unknown):string {
  if(error instanceof OddsBudgetStopped)return error.code;
  const message=error instanceof Error?error.message:'';
  if(/^ODDS_[A-Z_]+$/.test(message))return message;
  try{const e=JSON.parse(message);if(Number.isInteger(e.status))return `ODDSPAPI_HTTP_${e.status}`;}catch{/* Only allowlisted codes are persisted. */}
  return 'ODDS_REFRESH_FAILED';
}
export async function schedulerPlan(db:DatabaseClient,now=new Date(),tournaments:readonly CatalogTournament[]=[]){
  const [budget,fixtures,records]=await Promise.all([budgetHealth(db),canonicalFixtures(db),db.query(`SELECT b.provider_slug,
    EXISTS(SELECT 1 FROM bookmaker_geo_availability g WHERE g.bookmaker_id=b.id AND g.odds_enabled AND g.comparison_enabled
      AND g.verified_at IS NOT NULL AND g.verification_state IN ('VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX')) AS public_eligible,
    t.tournament_id,t.last_success_at,t.last_attempt_at,t.retry_after,t.consecutive_failures,t.last_error,
    EXISTS(SELECT 1 FROM odds_current legacy JOIN fixtures lf ON lf.id=legacy.fixture_id
      JOIN provider_entity_mappings lm ON lm.provider='ODDSPAPI' AND lm.entity_type='COMPETITION' AND lm.livasports_entity_id=lf.competition_id
      WHERE lm.provider_entity_id=t.tournament_id AND legacy.bookmaker_id=b.id AND legacy.status='ACTIVE'
        AND legacy.freshness_ttl_minutes IS NULL AND lf.status='SCHEDULED' AND lf.kickoff>now()) AS needs_cadence_refresh,
    EXISTS(SELECT 1 FROM odds_current o JOIN fixtures f ON f.id=o.fixture_id
      JOIN provider_entity_mappings m ON m.entity_type='COMPETITION' AND m.provider='ODDSPAPI' AND m.livasports_entity_id=f.competition_id
      WHERE m.provider_entity_id=t.tournament_id AND o.bookmaker_id=b.id AND o.status='ACTIVE' AND o.phase='PREGAME'
        AND f.status='SCHEDULED' AND f.kickoff>now()) AS useful_coverage
    FROM bookmakers b LEFT JOIN odds_refresh_targets t ON t.bookmaker=b.provider_slug WHERE b.provider_slug IN ('betano.bet.br','betsson')`)]);
  const catalog=tournaments.length?tournaments:schedulerTournaments([]);
  const targets:RefreshTarget[]=SCHEDULER_BOOKMAKERS.flatMap(bookmaker=>catalog.map(t=>{
    const row=records.rows.find(r=>r.provider_slug===bookmaker&&r.tournament_id===t.id);
    return {bookmaker,tournamentId:t.id,fixtures:fixtures.filter(f=>f.competition===t.canonical),publicEligible:row?.public_eligible===true,
      hasUsefulCoverage:row?.useful_coverage===true,lastSuccessAt:row?.last_success_at?.toISOString()??null,retryAfter:row?.retry_after?.toISOString()??null,
      lastError:typeof row?.last_error==='string'?row.last_error:null,needsCadenceRefresh:row?.needs_cadence_refresh===true,
      lastAttemptAt:row?.last_attempt_at?.toISOString?.()??null,consecutiveFailures:Number(row?.consecutive_failures??0)};
  }));
  return planScheduler(targets,now,budget);
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
  const provider=new M5OddsPapiAdapter(db,key,job,6,true,started+140000);
  let state:SchedulerState='SUCCEEDED';let errorCode:string|null=null;
  const results:Array<Record<string,unknown>>=[];let recovered=0;let catalogExpanded=false;
  let tournaments:CatalogTournament[]=schedulerTournaments([]);
  try{
    await db.query("UPDATE odds_sync_jobs SET trigger_source=$2 WHERE id=$1",[job,trigger]);
    await db.query(`UPDATE odds_scheduler_health SET state='RUNNING',last_job_id=$1,updated_at=now(),
      last_automatic_invocation_at=CASE WHEN $2 THEN now() ELSE last_automatic_invocation_at END WHERE id=true`,[job,trigger==='AUTOMATIC']);
    const catalog=(await db.query("SELECT markets,tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
    if(!catalog)throw new Error('ODDS_CATALOG_UNVERIFIED');verifyCatalog(catalog.markets,catalog.tournaments);
    tournaments=schedulerTournaments(catalog.tournaments);
    // P0 incident: a competition that is enabled, has upcoming fixtures and no catalog row must not wait for a manual
    // discovery run. One bounded /v4/tournaments call per 24h merges new provider rows (IDs are never invented).
    const upcoming=[...new Set((await canonicalFixtures(db)).filter(f=>f.status==='SCHEDULED'&&Date.parse(f.kickoff)>started&&Date.parse(f.kickoff)<started+14*86400000).map(f=>f.competition))];
    if(catalogNeedsExpansion(catalog.tournaments,upcoming)){
      const recent=await db.query("SELECT 1 FROM odds_provider_requests WHERE endpoint='/v4/tournaments' AND started_at>now()-interval '24 hours' LIMIT 1");
      const health=await budgetHealth(db);
      if(!recent.rowCount&&health.verified&&Number(health.safeRemaining)>=COVERAGE_DISCOVERY_REQUEST_CAP){
        try{
          const data=await provider.providerTournaments();
          if(Array.isArray(data)){
            const merged=mergeCatalogTournaments(catalog.tournaments,data);
            await db.query("UPDATE odds_provider_catalog SET tournaments=$1::jsonb,verified_at=now() WHERE provider='ODDSPAPI'",[JSON.stringify(merged)]);
            catalogExpanded=true;tournaments=schedulerTournaments(merged);
          }
        }catch(error){if(error instanceof OddsBudgetStopped)throw error;/* discovery failure never blocks the routine refresh */}
      }
    }
    provider.setCatalog(tournaments);
    await persistCatalogCompetitionMappings(db,tournaments);
    const pending=(await db.query('SELECT payload FROM odds_sync_snapshots WHERE applied_at IS NULL ORDER BY observed_at LIMIT 3')).rows;
    for(const row of pending){await persistSnapshot(db,job,row.payload as OddsSnapshot);recovered++;}
    if(pending.length===3)throw new Error('ODDS_RECOVERY_PENDING');
    if(!(await budgetHealth(db)).verified)await reconcileAccountPeriod(db,await provider.accountPeriod());
    const plan=await schedulerPlan(db,new Date(),tournaments);
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
          const snapshot={...await provider.snapshot(batch.bookmaker,ids),cadenceScale:current.cadence.scale};
          const saved=await persistSnapshot(db,job,snapshot);
          results.push({bookmaker:batch.bookmaker,tournamentIds:ids,returnedFixtures:saved.returnedFixtures,matchedFixtures:saved.matchedFixtures,
            quotes:saved.quotes,historyChanges:saved.history_changes,currentWrites:saved.current_writes,closed:saved.closed,observedAt:snapshot.observedAt,cadence:current.cadence});
        }catch(error){
          // A ledger stop is not a feed failure: leave target retry state untouched so proven feeds keep sharing requests.
          if(error instanceof OddsBudgetStopped){errorCode=error.code;state='BUDGET_STOPPED';break;}
          const isolatedEmpty=isProviderFixtureAbsent(error)&&ids.length===1&&!isStableOddsTournament(ids[0]);
          if(!isolatedEmpty)errorCode=safeSchedulerError(error);
          // The 12h empty-feed backoff applies only to feeds that never succeeded; a previously priced feed keeps the short ladder.
          const neverSucceeded=!current.targets.some(t=>t.bookmaker===batch.bookmaker&&ids.includes(t.tournamentId)&&t.proven);
          const longBackoff=isolatedEmpty&&neverSucceeded;
          const persistable=ids.filter(id=>tournaments.some(tournament=>tournament.id===id));
          if(persistable.length){
            try{
              await db.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,last_attempt_at,retry_after,consecutive_failures,last_error)
                SELECT $1,unnest($2::text[]),now(),now()+CASE WHEN $4 THEN interval '12 hours' ELSE interval '15 minutes' END,1,$3
                ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET last_attempt_at=now(),last_error=$3,
                  consecutive_failures=LEAST(odds_refresh_targets.consecutive_failures+1,10),
                  -- An isolated empty feed (provider lists no fixtures) waits 12h; other failures keep the bounded 15m→6h ladder.
                  retry_after=CASE WHEN $4 THEN now()+interval '12 hours' ELSE now()+LEAST(360,power(2,LEAST(odds_refresh_targets.consecutive_failures,5))*15)*interval '1 minute' END`,
                [batch.bookmaker,persistable,isolatedEmpty?'ODDSPAPI_HTTP_404':(errorCode??safeSchedulerError(error)),longBackoff]);
            }catch{/* Retry-target CHECK failures must not replace the provider status. */}
          }
          if(!isolatedEmpty)state=results.length?'PARTIAL':'FAILED';
        }
      }
      if(state==='FAILED'&&results.length)state='PARTIAL';
    }
  }catch(error){errorCode=safeSchedulerError(error);state=error instanceof OddsBudgetStopped?'BUDGET_STOPPED':results.length?'PARTIAL':'FAILED';}
  const next=await schedulerPlan(db,new Date(),tournaments).catch(()=>null);
  const result={jobId:job,trigger,state,requests:provider.requestCount(),recovered,catalogExpanded,feeds:results,error:errorCode,nextDueAt:next?.nextDueAt??null};
  await db.transaction(async tx=>{
    await tx.query("UPDATE odds_sync_jobs SET status=$2,completed_at=now(),error_code=$3,result=$4::jsonb WHERE id=$1 AND status='RUNNING'",[job,state,errorCode,JSON.stringify(result)]);
    await tx.query(`UPDATE odds_scheduler_health SET state=$1,last_error=CASE WHEN $1='SUCCEEDED' THEN NULL WHEN $2::text IS NOT NULL OR $5 THEN $2::text ELSE last_error END,
      feeds_refreshed=CASE WHEN $5 THEN $3::jsonb ELSE feeds_refreshed END,next_due_at=$4,updated_at=now(),
      last_refresh_at=CASE WHEN $5 THEN now() ELSE last_refresh_at END,
      last_automatic_refresh_at=CASE WHEN $5 AND $6 THEN now() ELSE last_automatic_refresh_at END WHERE id=true`,
      [state,errorCode,JSON.stringify(results.map(r=>r.bookmaker)),next?.nextDueAt??null,results.length>0,trigger==='AUTOMATIC']);
  });
  return result;
}
export async function schedulerHealth(db:DatabaseClient,automationConfigured=false){
  const [budget,status,lease,feeds,bookmakerHealth,coverage,catalog]=await Promise.all([budgetHealth(db),db.query('SELECT * FROM odds_scheduler_health WHERE id=true'),
    db.query("SELECT status,heartbeat_at,lease_expires_at,provider_requests FROM odds_sync_jobs WHERE status='RUNNING' ORDER BY started_at DESC LIMIT 1"),
    db.query('SELECT bookmaker,tournament_id,last_success_at,retry_after,consecutive_failures,last_error FROM odds_refresh_targets ORDER BY bookmaker,tournament_id'),
    readBookmakerCoverageHealth(db),readCoverageHealth(db).catch(error=>({state:'unknown' as const,error:safeSchedulerError(error)})),
    db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'").catch(()=>({rows:[]}))]);
  const row=status.rows[0];
  const healthyAutomatic=automationConfigured&&row?.last_automatic_invocation_at&&Date.now()-row.last_automatic_invocation_at.getTime()<10*60000
    &&!['FAILED','BUDGET_STOPPED'].includes(row.state);
  return {automationEnabled:automationConfigured,automationOperational:Boolean(healthyAutomatic),infrastructure:automationConfigured?'CONFIGURED_EXTERNAL_SCHEDULER':'NONE',
    state:row?.state??'READY',lastDiscoveryAt:row?.last_discovery_at??null,lastSuccessfulRefreshAt:row?.last_refresh_at??null,
    lastSuccessfulAutomatedRefreshAt:row?.last_automatic_refresh_at??null,lastAutomaticInvocationAt:row?.last_automatic_invocation_at??null,
    nextExpectedRun:automationConfigured?row?.next_due_at??null:null,
    nextPolicyDueAt:row?.next_due_at??null,fixturesConsidered:row?.fixtures_considered??0,feedsRefreshed:row?.feeds_refreshed??[],
    lastError:row?.last_error??null,activeLease:lease.rows[0]??null,feedStatus:feeds.rows,budget,providerRequests:0,
    liveOdds:LIVE_ODDS_CAPABILITY,bookmakerHealth,coverage,
    scheduledTournaments:schedulerTournaments((catalog.rows[0]?.tournaments as unknown[])??[]).map(t=>({id:t.id,canonical:t.canonical})),
    unmatchedCatalogRows:unmatchedCatalogRows((catalog.rows[0]?.tournaments as unknown[])??[])};
}
