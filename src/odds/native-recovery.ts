import type {DatabaseClient} from '@/database/client';
import {canonicalFixtures,persistSnapshot} from './ingestion';
import {readTeamIdentities} from './identity';
import {matchOddsSnapshot} from './matching';
import type {OddsSnapshot,PersistedFixtureMapping} from './types';
import {persistNativeDiagnostics} from './native-diagnostics';

/** Bounded saved-response repair. Never calls a provider or changes observation timestamps. */
export async function recoverNativeIdentities(db:DatabaseClient,jobId:string){
  const [fixtures,identities,saved,rows]=await Promise.all([
    canonicalFixtures(db),readTeamIdentities(db),
    db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",metadata->>'homeProviderId' AS "homeProviderId",
      metadata->>'awayProviderId' AS "awayProviderId",metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff"
      FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`),
    db.query(`SELECT s.id,s.payload FROM odds_sync_snapshots s WHERE s.observed_at>now()-interval '1 day'
      AND EXISTS(SELECT 1 FROM odds_native_diagnostics d WHERE d.snapshot_id=s.id AND d.classification IN ('IDENTITY_UNRESOLVED','INGESTION_BUG'))
      ORDER BY EXISTS(SELECT 1 FROM odds_native_diagnostics d WHERE d.snapshot_id=s.id AND d.classification='INGESTION_BUG') DESC,
      (SELECT max(a.at) FROM odds_recovery_actions a WHERE a.action='NATIVE_SAVED_REPAIR' AND a.detail->>'snapshotId'=s.id) ASC NULLS FIRST,s.observed_at DESC LIMIT 3`),
  ]);
  let repaired=0;
  for(const row of rows.rows){
    const snapshot=row.payload as OddsSnapshot;
    const unresolved=await db.query("SELECT provider_fixture_id FROM odds_native_diagnostics WHERE snapshot_id=$1 AND classification IN ('IDENTITY_UNRESOLVED','INGESTION_BUG')",[row.id]);
    // Check safety before replay; unresolved ambiguity never generates a provider retry.
    const matches=matchOddsSnapshot(snapshot.fixtures,fixtures,saved.rows as PersistedFixtureMapping[],identities);
    const canRepair=matches.some(m=>m.fixture&&Date.parse(m.raw.kickoff)>Date.now()&&unresolved.rows.some(r=>r.provider_fixture_id===m.raw.providerId));
    if(canRepair){
      await persistSnapshot(db,jobId,snapshot);
      await persistNativeDiagnostics(db,String(row.id),snapshot,matches);
      repaired++;
    }
    // Round-robin checks prevent an unresolved response from starving later repairable snapshots.
    await db.query(`INSERT INTO odds_recovery_actions(trigger_source,action,bookmaker,reason,request_cost,outcome,detail)
      VALUES('SCHEDULER','NATIVE_SAVED_REPAIR',$1,'Saved evidence only; no provider request',0,$2,$3::jsonb)`,
      [snapshot.bookmaker,canRepair?'REPLAYED':'IDENTITY_STILL_UNRESOLVED',JSON.stringify({snapshotId:row.id})]);
  }
  return {repaired,providerRequests:0};
}
