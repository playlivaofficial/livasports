import type {QueryExecutor} from '@/database/client';
import type {OddsSnapshot,NormalizedOddsQuote} from './types';
import {feedsForProvider,readVerifiedOperatorFeeds} from './operator-feeds';
import {eligibleSource} from './geo';

type StoredGeoQuote=NormalizedOddsQuote&{fixtureId:string;providerKickoff:string;freshnessTtlMinutes:number;status:string};
/** Uses the existing canonical matcher and worker transaction, while isolating each country/feed. */
export async function persistGeoSnapshotQuotes(db:QueryExecutor,snapshot:OddsSnapshot,quotes:readonly StoredGeoQuote[],closeableFixtureIds:readonly string[]){
  const feedId=snapshot.providerBookmakerId;
  if(!feedId||!snapshot.geoFeeds?.length)throw new Error('ODDS_GEO_FEED_UNVERIFIED');
  const current=feedsForProvider(await readVerifiedOperatorFeeds(db),feedId);
  const geos=[...new Set(snapshot.geoFeeds.map(f=>f.geo))];
  if(geos.some(geo=>!current.some(f=>f.geo===geo&&f.operatorId===snapshot.bookmaker))||current.some(f=>f.operatorId!==snapshot.bookmaker))throw new Error('ODDS_GEO_FEED_UNVERIFIED');
  // Re-read jurisdiction evidence at commit time. A bad/changed provider domain
  // must not replace good saved prices and merely disappear later at read time.
  if(quotes.some(q=>q.bookmaker!==snapshot.bookmaker||geos.some(geo=>{
    const feed=current.find(f=>f.geo===geo&&f.operatorId===snapshot.bookmaker)!;
    return !eligibleSource(snapshot.bookmaker,geo,`VERIFIED_${geo}`,q.sourceDomain,feed.sourceDomains);
  })))throw new Error('ODDS_GEO_SOURCE_UNVERIFIED');
  const rows=geos.flatMap(geo=>quotes.map(q=>({...q,geo})));
  const sourceSql=`SELECT r.*,b.id AS bookmaker_id FROM jsonb_to_recordset($1::jsonb) AS r(geo text,"fixtureId" uuid,bookmaker text,market text,outcome text,line numeric,
    "decimalOdds" numeric,status text,scope text,phase text,"providerFixtureId" text,"providerUpdatedAt" timestamptz,"observedAt" timestamptz,"sourceDomain" text,"providerKickoff" timestamptz,"freshnessTtlMinutes" numeric)
    JOIN bookmakers b ON b.provider_slug=r.bookmaker`;
  const changes=await db.query(`WITH incoming AS(${sourceSql}), changed AS(
    SELECT i.*,COALESCE(o.id,gen_random_uuid()) AS quote_id FROM incoming i LEFT JOIN odds_geo_current o
      ON o.geo=i.geo AND o.source_provider='ODDSPAPI' AND o.provider_bookmaker_id=$2 AND o.fixture_id=i."fixtureId" AND o.bookmaker_id=i.bookmaker_id
      AND o.market_code=i.market AND o.outcome_code=i.outcome AND o.line IS NOT DISTINCT FROM i.line
    WHERE (o.id IS NULL OR o.observed_at<=i."observedAt") AND (o.id IS NULL OR (o.decimal_odds,o.status) IS DISTINCT FROM(i."decimalOdds",i.status))
  ), history AS(INSERT INTO odds_geo_history(quote_id,geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,observed_at,source_domain)
    SELECT quote_id,geo,'ODDSPAPI',$2,"fixtureId",bookmaker_id,market,outcome,line,"decimalOdds",status,"observedAt","sourceDomain" FROM changed RETURNING id
  ), upserted AS(INSERT INTO odds_geo_current(id,geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,scope,phase,
      provider_fixture_id,provider_updated_at,observed_at,last_successful_refresh_at,provider_kickoff,freshness_ttl_minutes,source_domain,mapping_verified)
    SELECT COALESCE((SELECT ch.quote_id FROM changed ch WHERE ch.geo=i.geo AND ch."fixtureId"=i."fixtureId" AND ch.bookmaker_id=i.bookmaker_id
      AND ch.market=i.market AND ch.outcome=i.outcome AND ch.line IS NOT DISTINCT FROM i.line),gen_random_uuid()),
      geo,'ODDSPAPI',$2,"fixtureId",bookmaker_id,market,outcome,line,"decimalOdds",status,scope,phase,
      "providerFixtureId","providerUpdatedAt","observedAt","observedAt","providerKickoff","freshnessTtlMinutes","sourceDomain",true FROM incoming i
    ON CONFLICT(geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,(COALESCE(line,-999999.0))) DO UPDATE SET
      decimal_odds=excluded.decimal_odds,status=excluded.status,provider_fixture_id=excluded.provider_fixture_id,provider_updated_at=excluded.provider_updated_at,
      observed_at=excluded.observed_at,persisted_at=now(),last_successful_refresh_at=excluded.last_successful_refresh_at,provider_kickoff=excluded.provider_kickoff,
      freshness_ttl_minutes=excluded.freshness_ttl_minutes,source_domain=excluded.source_domain,mapping_verified=excluded.mapping_verified
    WHERE odds_geo_current.observed_at<excluded.observed_at OR (odds_geo_current.observed_at=excluded.observed_at AND odds_geo_current.status<>excluded.status)
    RETURNING id)
    SELECT (SELECT count(*) FROM history)::int AS history_changes,(SELECT count(*) FROM upserted)::int AS current_writes`,[JSON.stringify(rows),feedId]);
  // A parser failure/empty body is not withdrawal. Close only explicitly listed, validated fixture snapshots.
  const close=closeableFixtureIds.length?await db.query(`WITH changed AS(UPDATE odds_geo_current o SET status='CLOSED',persisted_at=now(),observed_at=$4,last_successful_refresh_at=$4
    WHERE o.geo=ANY($1::text[]) AND o.source_provider='ODDSPAPI' AND o.provider_bookmaker_id=$2 AND o.fixture_id=ANY($3::uuid[])
      AND o.observed_at<=$4 AND o.status<>'CLOSED'
      AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS q("fixtureId" uuid,market text,outcome text,line numeric)
        WHERE q."fixtureId"=o.fixture_id AND q.market=o.market_code AND q.outcome=o.outcome_code AND q.line IS NOT DISTINCT FROM o.line)
    RETURNING o.*)
    INSERT INTO odds_geo_history(quote_id,geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,observed_at,source_domain)
    SELECT id,geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,observed_at,source_domain FROM changed RETURNING id`,
    [geos,feedId,closeableFixtureIds,snapshot.observedAt,JSON.stringify(quotes)]):{rowCount:0};
  const lost=await db.query(`WITH incoming AS(${sourceSql}) SELECT 1 FROM incoming i WHERE NOT EXISTS(
    SELECT 1 FROM odds_geo_current o WHERE o.geo=i.geo AND o.source_provider='ODDSPAPI' AND o.provider_bookmaker_id=$2
      AND o.fixture_id=i."fixtureId" AND o.bookmaker_id=i.bookmaker_id AND o.market_code=i.market AND o.outcome_code=i.outcome AND o.line IS NOT DISTINCT FROM i.line
      AND (o.observed_at>i."observedAt" OR (o.observed_at=i."observedAt" AND o.decimal_odds=i."decimalOdds" AND o.status=i.status))) LIMIT 1`,[JSON.stringify(rows),feedId]);
  if(lost.rowCount)throw new Error('ODDS_PERSISTENCE_VERIFICATION_FAILED');
  return {history_changes:Number(changes.rows[0]?.history_changes??0),current_writes:Number(changes.rows[0]?.current_writes??0),closed:Number(close.rowCount??0)};
}
