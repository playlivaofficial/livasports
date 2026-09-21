import type {QueryExecutor} from '@/database/client';
import {SELECTIONS,type OddsSnapshot,type FixtureMatch,type ProviderOddsFixture} from './types';

export const NATIVE_REASONS=['PROVIDER_GAP','INGESTION_BUG','IDENTITY_UNRESOLVED','MARKET_MAPPING_FAILURE','STALE_OR_EXPIRED','SUSPENDED_OR_REMOVED','QUOTA_OR_BACKOFF_DELAY','UNKNOWN_PIPELINE_DEFECT'] as const;
export type NativeReason=typeof NATIVE_REASONS[number];
export type SnapshotMatch=FixtureMatch&{raw:ProviderOddsFixture;candidateFixtureIds?:string[]};
export function snapshotDiagnostics(snapshot:OddsSnapshot,matches:readonly SnapshotMatch[]){
  const records:Array<{provider_fixture_id:string;fixture_id:string|null;market:string;outcome:string;classification:string;evidence:Record<string,unknown>}>=matches.flatMap(m=>Object.entries(SELECTIONS).flatMap(([market,outcomes])=>outcomes.map(outcome=>{
    const quote=snapshot.quotes.find(q=>q.providerFixtureId===m.raw.providerId&&q.market===market&&q.outcome===outcome);
    const rejected=snapshot.diagnostics?.find(d=>d.providerFixtureId===m.raw.providerId&&d.market===market&&(!d.outcome||d.outcome===outcome));
    const classification=!m.fixture?'IDENTITY_UNRESOLVED':rejected&&!quote?'MARKET_MAPPING_FAILURE':!quote?'PROVIDER_GAP':
      m.fixture.status!=='SCHEDULED'||m.raw.status!=='PREGAME'||Date.now()>=Math.min(Date.parse(m.fixture.kickoff),Date.parse(m.raw.kickoff))||['SUSPENDED','WITHDRAWN','CLOSED'].includes(quote.status)?'SUSPENDED_OR_REMOVED':quote.status==='STALE'?'STALE_OR_EXPIRED':'NATIVE_PERSISTED';
    return {provider_fixture_id:m.raw.providerId,fixture_id:m.fixture?.id??null,market,outcome,classification,
      evidence:{tournamentId:m.raw.providerCompetitionId,home:m.raw.homeNames,away:m.raw.awayNames,kickoff:m.raw.kickoff,candidate:m.fixture?.id??null,
        candidates:m.candidateFixtureIds??[],confidence:m.state,reason:rejected?.reason??m.reason,quote:quote??null}};
  })));
  // Preserve rejected rows even when fixture identity/envelope never reached the matching stage.
  for(const d of snapshot.diagnostics??[]){
    if(records.some(r=>r.provider_fixture_id===d.providerFixtureId&&r.market===d.market&&r.outcome===d.outcome))continue;
    records.push({provider_fixture_id:d.providerFixtureId,fixture_id:null,market:d.market,outcome:d.outcome,
      classification:d.reason.startsWith('OUT_OF_SCOPE')?'OUT_OF_SCOPE':d.market?'MARKET_MAPPING_FAILURE':'IDENTITY_UNRESOLVED',
      evidence:{tournamentId:d.tournamentId,home:[],away:[],kickoff:String(d.evidence.kickoff??''),candidate:null,confidence:'NO_MATCH',reason:d.reason,quote:null,...d.evidence}});
  }
  return records;
}
export async function persistNativeDiagnostics(db:QueryExecutor,snapshotId:string,snapshot:OddsSnapshot,matches:readonly SnapshotMatch[]){
  const records=snapshotDiagnostics(snapshot,matches);
  await db.query(`INSERT INTO odds_native_diagnostics(snapshot_id,bookmaker,provider_fixture_id,fixture_id,market,outcome,classification,evidence,observed_at)
    SELECT DISTINCT ON (provider_fixture_id,market,outcome) $1,$2,provider_fixture_id,fixture_id,market,outcome,classification,evidence,$4
    FROM jsonb_to_recordset($3::jsonb) AS r(provider_fixture_id text,fixture_id uuid,market text,outcome text,classification text,evidence jsonb)
    ON CONFLICT(snapshot_id,bookmaker,provider_fixture_id,market,outcome) DO UPDATE SET
      fixture_id=excluded.fixture_id,classification=excluded.classification,evidence=excluded.evidence
    WHERE (odds_native_diagnostics.fixture_id,odds_native_diagnostics.classification,odds_native_diagnostics.evidence)
      IS DISTINCT FROM (excluded.fixture_id,excluded.classification,excluded.evidence)`,[snapshotId,snapshot.bookmaker,JSON.stringify(records),snapshot.observedAt]);
  // Verify persistence inside the same transaction, including newer rows that legitimately supersede a replay.
  await db.query(`UPDATE odds_native_diagnostics d SET classification='INGESTION_BUG'
    WHERE snapshot_id=$1 AND classification='NATIVE_PERSISTED' AND NOT EXISTS(
      SELECT 1 FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id WHERE b.provider_slug=d.bookmaker
      AND o.fixture_id=d.fixture_id AND o.market_code=d.market AND o.outcome_code=d.outcome
      AND o.line IS NOT DISTINCT FROM CASE WHEN d.market='TOTAL_GOALS' THEN 2.5::numeric ELSE NULL::numeric END
      AND (o.observed_at>d.observed_at OR (o.observed_at=d.observed_at
        AND o.decimal_odds=(d.evidence->'quote'->>'decimalOdds')::numeric
        AND o.status=d.evidence->'quote'->>'status')))`,[snapshotId]);
}
