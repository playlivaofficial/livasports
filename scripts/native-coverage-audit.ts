/** DB-only native audit/bootstrap; no provider client is imported or called. */
import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {canonicalFixtures,startOddsJob,endOddsJob,persistSnapshot} from '../src/odds/ingestion';
import {recoverNativeIdentities} from '../src/odds/native-recovery';
import {readTeamIdentities,rememberTeamAliases} from '../src/odds/identity';
import {matchOddsSnapshot} from '../src/odds/matching';
import {persistNativeDiagnostics} from '../src/odds/native-diagnostics';
import {readNativeCoverage,recordNativeCoverage} from '../src/odds/native-coverage';
import {budgetHealth} from '../src/odds/budget';
import type {OddsSnapshot,PersistedFixtureMapping} from '../src/odds/types';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  if(process.argv.includes('--bootstrap')){
    const fixtures=await canonicalFixtures(db),identities=await readTeamIdentities(db);
    const saved=(await db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",metadata->>'homeProviderId' AS "homeProviderId",
      metadata->>'awayProviderId' AS "awayProviderId",metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff"
      FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`)).rows as PersistedFixtureMapping[];
    const rows=(await db.query(`WITH latest AS (SELECT DISTINCT ON(s.bookmaker,t.id) s.id,s.payload,s.observed_at FROM odds_sync_snapshots s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') t(id)
      WHERE s.observed_at>now()-interval '2 days' ORDER BY s.bookmaker,t.id,s.observed_at DESC)
      SELECT DISTINCT id,payload FROM latest LIMIT 136`)).rows;
    for(const row of rows){
      const snapshot=row.payload as OddsSnapshot;
      const matches=matchOddsSnapshot(snapshot.fixtures,fixtures,saved,identities);
      await db.transaction(async tx=>{await rememberTeamAliases(tx,matches);await persistNativeDiagnostics(tx,String(row.id),snapshot,matches);});
    }
  }
  if(process.argv.includes('--repair')){
    const job=await startOddsJob(db);let ok=false;
    try{console.log(JSON.stringify(await recoverNativeIdentities(db,job)));ok=true;}finally{await endOddsJob(db,job,ok);}
  }
  if(process.argv.includes('--verify-replay')){
    const rows=(await db.query(`SELECT s.payload FROM odds_recovery_actions a JOIN odds_sync_snapshots s ON s.id=a.detail->>'snapshotId'
      WHERE a.action='NATIVE_SAVED_REPAIR' AND a.outcome='REPLAYED' ORDER BY a.at DESC LIMIT 3`)).rows;
    const job=await startOddsJob(db);let ok=false;
    try{const results=[];for(const row of rows){const r=await persistSnapshot(db,job,row.payload as OddsSnapshot);results.push({currentWrites:r.current_writes,historyChanges:r.history_changes,closed:r.closed});}
      console.log(JSON.stringify({idempotency:results,providerRequests:0}));ok=true;
    }finally{await endOddsJob(db,job,ok);}
  }
  const report=process.argv.includes('--record')?await recordNativeCoverage(db):await readNativeCoverage(db);
  const budget=await budgetHealth(db);
  const integrity=(await db.query(`SELECT
    (SELECT count(*) FROM odds_team_aliases) AS aliases,
    (SELECT count(*) FROM odds_native_diagnostics) AS diagnostics,
    (SELECT count(*) FROM odds_current) AS odds,
    (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,coalesce(line,-999999) FROM odds_current GROUP BY 1,2,3,4,5 HAVING count(*)>1) d) AS duplicates,
    (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id WHERE f.id IS NULL) AS orphans`)).rows[0];
  const suffix=process.argv.includes('--before')?'before':'after';
  const operations=(await db.query(`SELECT state,last_automatic_invocation_at,last_automatic_refresh_at,last_error,
    (SELECT max(bucket) FROM odds_native_rollups) AS native_rollup,
    (SELECT max(at) FROM odds_recovery_actions WHERE action='NATIVE_SAVED_REPAIR') AS native_recovery_check,
    (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs
    FROM odds_scheduler_health WHERE id=true`)).rows[0];
  await writeFile(`output/native-coverage-${suffix}-private.json`,JSON.stringify({report,budget,integrity,operations},null,2));
  console.log(JSON.stringify({at:report.at,providerRequests:0,fixtures:report.fixtures,summary:report.groups.filter(g=>g.competition==='*'),counts:report.counts,pipelineLoss:report.pipelineLoss,unresolvedIdentities:report.unresolvedIdentities,unresolvedInWindow:report.unresolvedInWindow,integrity,operations,quota:budget.governor}));
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'):'AUDIT_FAILED');process.exitCode=1;}finally{await db.close();}
