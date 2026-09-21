import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseClient, QueryExecutor } from '@/database/client';
import { canonicalBookmakerSlug } from './bookmaker';
import { matchOddsSnapshot } from './matching';
import {readTeamIdentities,rememberTeamAliases} from './identity';
import {persistNativeDiagnostics} from './native-diagnostics';
import {freshnessTtlMs} from './scheduler-policy';
import type { CanonicalOddsFixture, OddsSnapshot, PersistedFixtureMapping } from './types';
import {persistNativeSourceBatch} from './native-source-persistence';
import {APPROVED_NATIVE_SOURCE_IDS} from './source-registry';

/** Close only quotes the latest snapshot actually listed. Fixtures outside the feed stay until they go stale. */
export function snapshotAbsenceCloseScope(snapshot:OddsSnapshot,acceptedFixtureIds:readonly string[]){
  return {
    bookmaker:canonicalBookmakerSlug(snapshot.bookmaker)??snapshot.bookmaker,
    fixtureIds:[...new Set(acceptedFixtureIds.filter(id=>typeof id==='string'&&id.length>0))],
    providerFixtureIds:[...new Set(snapshot.fixtures.map(fixture=>fixture.providerId))],
  };
}

export function assertMappingConsistency(mappings:readonly {type:string;external:string;internal:string}[]):void {
  const external=new Map<string,string>();const internal=new Map<string,string>();
  for(const mapping of mappings){
    const externalKey=`${mapping.type}:${mapping.external}`;const internalKey=`${mapping.type}:${mapping.internal}`;
    if((external.has(externalKey)&&external.get(externalKey)!==mapping.internal)||
      (internal.has(internalKey)&&internal.get(internalKey)!==mapping.external))throw new Error('ODDS_IDENTITY_CONFLICT');
    external.set(externalKey,mapping.internal);internal.set(internalKey,mapping.external);
  }
}

export async function canonicalFixtures(db:QueryExecutor):Promise<CanonicalOddsFixture[]> {
  const result=await db.query(`SELECT f.id,c.id AS "competitionId",c.slug AS competition,s.code AS sport,f.kickoff,f.status,
    h.id AS "homeId",h.name AS home,a.id AS "awayId",a.name AS away
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.enabled JOIN sports s ON s.id=f.sport_id
    JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id
    WHERE f.kickoff BETWEEN now()-interval '2 days' AND now()+interval '45 days'`);
  return result.rows.map(r=>({...r,kickoff:r.kickoff.toISOString()}) as CanonicalOddsFixture);
}
export async function startOddsJob(db:DatabaseClient):Promise<string> {
  return db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-m5-odds-worker'))");
    await tx.query("UPDATE odds_sync_jobs SET status='INTERRUPTED',completed_at=now(),error_code='LEASE_EXPIRED' WHERE status='RUNNING' AND lease_expires_at<=now()");
    if((await tx.query("SELECT id FROM odds_sync_jobs WHERE status='RUNNING'")).rowCount)throw new Error('ODDS_WORKER_ALREADY_RUNNING');
    const id=randomUUID();await tx.query("INSERT INTO odds_sync_jobs(id,status,lease_expires_at) VALUES($1,'RUNNING',now()+interval '3 minutes')",[id]);return id;
  });
}
export async function endOddsJob(db:DatabaseClient,id:string,success:boolean):Promise<void>{
  await db.query('UPDATE odds_sync_jobs SET status=$2,completed_at=now(),error_code=$3 WHERE id=$1 AND status=\'RUNNING\'',[id,success?'SUCCEEDED':'FAILED',success?null:'SAFE_WORKER_FAILURE']);
}
export async function persistSnapshot(db:DatabaseClient,jobId:string,snapshot:OddsSnapshot){
  const key=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  // Saving first makes an interrupted successful provider response replayable without another request.
  await db.query('INSERT INTO odds_sync_snapshots(id,bookmaker,observed_at,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING',[key,snapshot.bookmaker,snapshot.observedAt,JSON.stringify(snapshot)]);
  return db.transaction(async tx=>{
    const lease=await tx.query("UPDATE odds_sync_jobs SET heartbeat_at=now(),lease_expires_at=now()+interval '3 minutes' WHERE id=$1 AND status='RUNNING' AND lease_expires_at>now() RETURNING id",[jobId]);
    if(!lease.rowCount)throw new Error('ODDS_WORKER_LEASE_LOST');
    const fixtures=await canonicalFixtures(tx);
    const saved=(await tx.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "fixtureId",
      metadata->>'homeProviderId' AS "homeProviderId",metadata->>'awayProviderId' AS "awayProviderId",
      metadata->>'canonicalKickoff' AS "canonicalKickoff",metadata->>'providerKickoff' AS "providerKickoff"
      FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='FIXTURE'`)).rows as PersistedFixtureMapping[];
    // Later matchweeks on an already-scheduled tournament map automatically when names+kickoff uniquely match. Ambiguous rows stay unmapped.
    const identities=await readTeamIdentities(tx);
    const matches=matchOddsSnapshot(snapshot.fixtures,fixtures,saved,identities);
    const mappings:Array<{type:string;external:string;internal:string;meta:unknown}>=[];
    for(const m of matches){if(!m.fixture)continue;
      const f=m.fixture;
      mappings.push({type:'FIXTURE',external:m.raw.providerId,internal:f.id,meta:{homeProviderId:m.raw.homeProviderId,awayProviderId:m.raw.awayProviderId,providerCompetitionId:m.raw.providerCompetitionId,canonicalKickoff:f.kickoff,providerKickoff:m.raw.kickoff,state:m.state}},
        {type:'COMPETITION',external:m.raw.providerCompetitionId,internal:f.competitionId,meta:{canonical:f.competition}},
        {type:'TEAM',external:m.raw.homeProviderId,internal:f.homeId,meta:{names:m.raw.homeNames,canonical:f.home,competition:f.competition}},
        {type:'TEAM',external:m.raw.awayProviderId,internal:f.awayId,meta:{names:m.raw.awayNames,canonical:f.away,competition:f.competition}});
    }
    assertMappingConsistency(mappings);
    const distinct=[...new Map(mappings.map(m=>[`${m.type}:${m.external}`,m])).values()];
    const conflict=await tx.query(`WITH incoming AS(SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(type text,external text,internal uuid))
      SELECT 1 FROM incoming i JOIN provider_entity_mappings m ON m.provider='ODDSPAPI' AND m.entity_type=i.type
      AND ((m.provider_entity_id=i.external AND m.livasports_entity_id<>i.internal) OR (m.livasports_entity_id=i.internal AND m.provider_entity_id<>i.external)) LIMIT 1`,[JSON.stringify(distinct)]);
    if(conflict.rowCount)throw new Error('ODDS_IDENTITY_CONFLICT');
    await tx.query(`INSERT INTO provider_entity_mappings(provider,entity_type,provider_entity_id,livasports_entity_id,metadata)
      SELECT 'ODDSPAPI',type,external,internal,meta FROM jsonb_to_recordset($1::jsonb) AS r(type text,external text,internal uuid,meta jsonb)
      ON CONFLICT(provider,entity_type,provider_entity_id) DO UPDATE SET metadata=provider_entity_mappings.metadata||excluded.metadata
      WHERE provider_entity_mappings.livasports_entity_id=excluded.livasports_entity_id
        AND provider_entity_mappings.entity_type='FIXTURE'
        AND (NOT(provider_entity_mappings.metadata ? 'canonicalKickoff')
          OR abs(extract(epoch from ((provider_entity_mappings.metadata->>'canonicalKickoff')::timestamptz - (excluded.metadata->>'canonicalKickoff')::timestamptz))) <= 600)`,[JSON.stringify(distinct)]);
    await rememberTeamAliases(tx,matches);
    const reviews=matches.map(m=>({provider_fixture_id:m.raw.providerId,fixture_id:m.fixture?.id??null,state:m.state,reason:m.reason,evidence:m.raw,observed_at:snapshot.observedAt}));
    await tx.query(`INSERT INTO odds_mapping_reviews(provider_fixture_id,fixture_id,state,reason,evidence,observed_at)
      SELECT provider_fixture_id,fixture_id,state,reason,evidence,observed_at FROM jsonb_to_recordset($1::jsonb)
      AS r(provider_fixture_id text,fixture_id uuid,state text,reason text,evidence jsonb,observed_at timestamptz)
      ON CONFLICT(provider_fixture_id) DO UPDATE SET fixture_id=excluded.fixture_id,state=excluded.state,reason=excluded.reason,
      evidence=excluded.evidence,observed_at=excluded.observed_at,reviewed_at=now() WHERE odds_mapping_reviews.observed_at<excluded.observed_at
      OR (odds_mapping_reviews.observed_at=excluded.observed_at AND odds_mapping_reviews.state IS DISTINCT FROM excluded.state)`,[JSON.stringify(reviews)]);
    const accepted=new Map(matches.filter(m=>m.fixture).map(m=>[m.raw.providerId,m]));
    const bookmaker=canonicalBookmakerSlug(snapshot.bookmaker)??snapshot.bookmaker;
    const quotes=snapshot.quotes.flatMap(q=>{const m=accepted.get(q.providerFixtureId);if(!m?.fixture)return [];
      const hours=(Math.min(Date.parse(m.fixture.kickoff),Date.parse(m.raw.kickoff))-Date.parse(snapshot.observedAt))/3600000;
      return [{...q,bookmaker,fixtureId:m.fixture.id,providerKickoff:m.raw.kickoff,freshnessTtlMinutes:freshnessTtlMs(hours,2,snapshot.cadenceScale??1)/60000,
        status:m.fixture.status!=='SCHEDULED'||Date.now()>=Math.min(Date.parse(m.fixture.kickoff),Date.parse(m.raw.kickoff))?'CLOSED':q.status}];});
    const sourceWrites=await persistNativeSourceBatch(tx,{sourceProvider:'ODDSPAPI',observedAt:snapshot.observedAt,requestCount:0,quotes:quotes.map(q=>({
      sourceProvider:'ODDSPAPI',fixture:{providerFixtureId:q.providerFixtureId,canonicalFixtureId:q.fixtureId,mappingVerified:true},
      bookmaker:q.bookmaker,providerBookmakerId:snapshot.bookmaker,market:q.market,providerMarketId:q.market,outcome:q.outcome,line:q.line,
      decimalOdds:q.decimalOdds,status:q.status,providerUpdatedAt:q.providerUpdatedAt,observedAt:q.observedAt,providerKickoff:q.providerKickoff,
      freshnessTtlMinutes:q.freshnessTtlMinutes,sourceDomain:q.sourceDomain,confidence:'VERIFIED' as const,
    }))},APPROVED_NATIVE_SOURCE_IDS);
    const sourceSql=`SELECT r.*,b.id AS bookmaker_id FROM jsonb_to_recordset($1::jsonb) AS r("fixtureId" uuid,bookmaker text,market text,outcome text,line numeric,
      "decimalOdds" numeric,status text,scope text,phase text,"providerFixtureId" text,"providerUpdatedAt" timestamptz,"observedAt" timestamptz,"sourceDomain" text,"providerKickoff" timestamptz,"freshnessTtlMinutes" numeric)
      JOIN bookmakers b ON b.provider_slug=r.bookmaker`;
    const changes=await tx.query(`WITH incoming AS(${sourceSql}), changed AS(
      SELECT i.* FROM incoming i LEFT JOIN odds_current o ON o.fixture_id=i."fixtureId" AND o.bookmaker_id=i.bookmaker_id
      AND o.market_code=i.market AND o.outcome_code=i.outcome AND o.line IS NOT DISTINCT FROM i.line
      WHERE (o.id IS NULL OR o.observed_at<=i."observedAt") AND (o.id IS NULL OR (o.decimal_odds,o.status) IS DISTINCT FROM (i."decimalOdds",i.status))
    ), history AS(INSERT INTO odds_history(fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,provider_updated_at,received_at,status,scope,phase,observed_at)
      SELECT "fixtureId",bookmaker_id,market,outcome,line,"decimalOdds","providerUpdatedAt","observedAt",status,scope,phase,"observedAt" FROM changed RETURNING id),
    upserted AS(INSERT INTO odds_current(fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,provider_updated_at,received_at,status,scope,phase,provider_fixture_id,source_domain,observed_at,persisted_at,last_successful_refresh_at,provider_kickoff,freshness_ttl_minutes)
      SELECT "fixtureId",bookmaker_id,market,outcome,line,"decimalOdds","providerUpdatedAt","observedAt",status,scope,phase,"providerFixtureId","sourceDomain","observedAt",now(),"observedAt","providerKickoff","freshnessTtlMinutes" FROM incoming
      ON CONFLICT(fixture_id,bookmaker_id,market_code,outcome_code,(COALESCE(line,-999999.0))) DO UPDATE SET
      decimal_odds=excluded.decimal_odds,provider_updated_at=excluded.provider_updated_at,received_at=excluded.received_at,status=excluded.status,scope=excluded.scope,phase=excluded.phase,
      provider_fixture_id=excluded.provider_fixture_id,source_domain=excluded.source_domain,observed_at=excluded.observed_at,persisted_at=now(),last_successful_refresh_at=excluded.last_successful_refresh_at,provider_kickoff=excluded.provider_kickoff,freshness_ttl_minutes=excluded.freshness_ttl_minutes,updated_at=now()
      WHERE odds_current.observed_at IS NULL OR odds_current.observed_at<excluded.observed_at
      OR (odds_current.observed_at=excluded.observed_at AND odds_current.status<>excluded.status) RETURNING id)
      SELECT (SELECT count(*) FROM history)::int AS history_changes,(SELECT count(*) FROM upserted)::int AS current_writes`,[JSON.stringify(quotes)]);
    // Explicit absence only for fixtures this snapshot listed and matched. Later matchweeks stay until they stale.
    const closeScope=snapshotAbsenceCloseScope({...snapshot,bookmaker},[...accepted.values()].flatMap(m=>m.fixture?[m.fixture.id]:[]));
    const closed=closeScope.fixtureIds.length&&closeScope.providerFixtureIds.length?await tx.query(`WITH changed AS(UPDATE odds_current o SET status='CLOSED',updated_at=now(),persisted_at=now(),
      observed_at=$4::timestamptz,last_successful_refresh_at=$4::timestamptz
      FROM bookmakers b WHERE o.bookmaker_id=b.id AND b.provider_slug=$1
      AND o.fixture_id=ANY($2::uuid[]) AND o.provider_fixture_id=ANY($3::text[])
      AND o.scope='FULL_TIME_REGULATION' AND o.status<>'CLOSED' AND o.observed_at<=$4::timestamptz
      AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS q("fixtureId" uuid,market text,outcome text,line numeric)
        WHERE q."fixtureId"=o.fixture_id AND q.market=o.market_code AND q.outcome=o.outcome_code AND q.line IS NOT DISTINCT FROM o.line) RETURNING o.*)
      INSERT INTO odds_history(fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,provider_updated_at,received_at,status,scope,phase,observed_at)
      SELECT fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,provider_updated_at,received_at,status,scope,phase,observed_at FROM changed RETURNING id`,
      [closeScope.bookmaker,closeScope.fixtureIds,closeScope.providerFixtureIds,snapshot.observedAt,JSON.stringify(quotes)]):{rowCount:0};
    await persistNativeDiagnostics(tx,key,snapshot,matches);
    await tx.query('UPDATE odds_sync_snapshots SET applied_at=COALESCE(applied_at,now()) WHERE id=$1',[key]);
    await tx.query(`INSERT INTO odds_refresh_targets(bookmaker,tournament_id,last_success_at,last_attempt_at)
      SELECT $1,unnest($2::text[]),$3,$3 ON CONFLICT(bookmaker,tournament_id) DO UPDATE SET
      last_success_at=excluded.last_success_at,last_attempt_at=excluded.last_attempt_at,retry_after=NULL,consecutive_failures=0,last_error=NULL,
      failure_class=NULL,backoff_reason=NULL,next_recheck_at=NULL,failure_evidence='{}'::jsonb
      WHERE odds_refresh_targets.last_success_at IS NULL OR odds_refresh_targets.last_success_at<excluded.last_success_at`,
      [bookmaker,snapshot.tournamentIds,snapshot.observedAt]);
    await tx.query("UPDATE odds_sync_jobs SET cursor=cursor+1,heartbeat_at=now(),lease_expires_at=now()+interval '3 minutes' WHERE id=$1",[jobId]);
    return {bookmaker,returnedFixtures:snapshot.fixtures.length,matchedFixtures:accepted.size,quotes:quotes.length,sourceWrites,
      history_changes:Number(changes.rows[0]?.history_changes??0),current_writes:Number(changes.rows[0]?.current_writes??0),closed:closed.rowCount,
      matching:matches.map(m=>({providerId:m.raw.providerId,fixtureId:m.fixture?.id??null,state:m.state,reason:m.reason})),rejected:snapshot.rejected};
  });
}
