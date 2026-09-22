import type {QueryExecutor} from '@/database/client';
import {canonicalBookmakerSlug} from './bookmaker';
import type {NativeOddsSourceBatch,NativeSourceQuote} from '@/providers/contracts/NativeOddsSource';
import {validateNativeSourceBatch} from '@/providers/contracts/NativeOddsSource';

/** Persist one supplier independently. It never overwrites another supplier or changes public bookmaker identity. */
export async function persistNativeSourceBatch(db:QueryExecutor,input:NativeOddsSourceBatch,approvedSources:readonly string[]){
  const {batch,rejected}=validateNativeSourceBatch(input);
  if(!approvedSources.includes(batch.sourceProvider))throw new Error('UNAPPROVED_NATIVE_SOURCE');
  const quotes=batch.quotes.map(q=>({...q,bookmaker:canonicalBookmakerSlug(q.bookmaker)??q.bookmaker,metadata:q.metadata??{}}));
  const rejections={count:rejected.length,reasons:[...new Set(rejected.map(r=>r.reason))]};
  if(!quotes.length)return {historyChanges:0,currentWrites:0,rejections};
  const rows=JSON.stringify(quotes);
  const result=await db.query(`WITH incoming AS(
    SELECT r.*,b.id AS bookmaker_id FROM jsonb_to_recordset($1::jsonb) AS r(
      "sourceProvider" text,"providerQuoteId" text,fixture jsonb,bookmaker text,"providerBookmakerId" text,
      market text,"providerMarketId" text,outcome text,line numeric,"decimalOdds" numeric,status text,
      "providerUpdatedAt" timestamptz,"observedAt" timestamptz,"providerKickoff" timestamptz,
      "freshnessTtlMinutes" numeric,"sourceDomain" text,confidence text,metadata jsonb)
    JOIN bookmakers b ON b.provider_slug=r.bookmaker
  ), changed AS(
    SELECT i.* FROM incoming i LEFT JOIN odds_native_source_current o
      ON o.source_provider=i."sourceProvider" AND o.fixture_id=(i.fixture->>'canonicalFixtureId')::uuid
      AND o.bookmaker_id=i.bookmaker_id AND o.market_code=i.market AND o.outcome_code=i.outcome AND o.line IS NOT DISTINCT FROM i.line
    WHERE o.id IS NULL OR (o.observed_at<=i."observedAt" AND (o.decimal_odds,o.status,o.confidence) IS DISTINCT FROM(i."decimalOdds",i.status,i.confidence))
  ), history AS(
    INSERT INTO odds_native_source_history(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,provider_fixture_id,
      provider_updated_at,observed_at,confidence,metadata)
    SELECT "sourceProvider",(fixture->>'canonicalFixtureId')::uuid,bookmaker_id,market,outcome,line,"decimalOdds",status,
      fixture->>'providerFixtureId',"providerUpdatedAt","observedAt",confidence,metadata||jsonb_build_object('providerBookmakerId',"providerBookmakerId",'providerMarketId',"providerMarketId")
    FROM changed RETURNING id
  ), current AS(
    INSERT INTO odds_native_source_current(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,scope,phase,
      provider_fixture_id,provider_updated_at,observed_at,last_successful_refresh_at,provider_kickoff,freshness_ttl_minutes,source_domain,mapping_verified,confidence,metadata)
    SELECT "sourceProvider",(fixture->>'canonicalFixtureId')::uuid,bookmaker_id,market,outcome,line,"decimalOdds",status,'FULL_TIME_REGULATION','PREGAME',
      fixture->>'providerFixtureId',"providerUpdatedAt","observedAt","observedAt","providerKickoff","freshnessTtlMinutes","sourceDomain",
      (fixture->>'mappingVerified')::boolean,confidence,metadata||jsonb_build_object('providerBookmakerId',"providerBookmakerId",'providerMarketId',"providerMarketId")
    FROM incoming ON CONFLICT(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,(COALESCE(line,-999999.0))) DO UPDATE SET
      decimal_odds=excluded.decimal_odds,status=excluded.status,provider_fixture_id=excluded.provider_fixture_id,
      provider_updated_at=excluded.provider_updated_at,observed_at=excluded.observed_at,persisted_at=now(),
      last_successful_refresh_at=excluded.last_successful_refresh_at,provider_kickoff=excluded.provider_kickoff,
      freshness_ttl_minutes=excluded.freshness_ttl_minutes,source_domain=excluded.source_domain,mapping_verified=excluded.mapping_verified,
      confidence=excluded.confidence,metadata=excluded.metadata
    WHERE odds_native_source_current.observed_at<excluded.observed_at
      OR (odds_native_source_current.observed_at=excluded.observed_at AND odds_native_source_current.status<>excluded.status)
    RETURNING id)
  SELECT (SELECT count(*) FROM history)::int AS history_changes,(SELECT count(*) FROM current)::int AS current_writes`,[rows]);
  return {historyChanges:Number(result.rows[0]?.history_changes??0),currentWrites:Number(result.rows[0]?.current_writes??0),rejections};
}

export function sourceHealthKey(quote:Pick<NativeSourceQuote,'sourceProvider'|'bookmaker'>){return `${quote.sourceProvider}:${canonicalBookmakerSlug(quote.bookmaker)??quote.bookmaker}`;}
