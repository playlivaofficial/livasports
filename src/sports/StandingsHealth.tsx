import type {QueryExecutor} from '@/database/client';
export async function StandingsHealth({db}:{db:QueryExecutor}){
  let rows:Record<string,unknown>[],requests:number;
  try {
    rows=(await db.query(`SELECT c.name,s.name AS season,q.*,extract(epoch FROM now()-q.last_success_at)::int AS age_seconds
      FROM standings_refresh_state q JOIN seasons s ON s.id=q.season_id JOIN competitions c ON c.id=q.competition_id
      WHERE c.enabled AND (s.is_current OR q.dirty_version>q.refreshed_version) ORDER BY c.priority_br,c.slug`)).rows;
    const usage=(await db.query(`SELECT count(*)::int AS requests FROM standings_refresh_attempts WHERE started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`)).rows[0];
    requests=Number(usage.requests);
  }catch{return <section className="owner-health"><h2>Standings freshness</h2><p>Diagnostics unavailable. Freshness is not verified.</p></section>;}
    return <section className="owner-health" id="standings-health"><h2>Standings freshness</h2><p>Provider requests today: {requests}/192. Bounded refresh every 5 minutes for due seasons; 12-hour safety refresh. Public reads: 0 provider requests.</p>
      {rows.map(r=><details key={String(r.season_id)}><summary>{String(r.name)} · {String(r.season)} — {r.last_error||String(r.dirty_version)!==String(r.refreshed_version)||r.age_seconds===null||Number(r.age_seconds)>46800?'STALE / PENDING':'CURRENT'} · {Number(r.row_count)} rows</summary>
        <dl>{Object.entries({competitionId:r.competition_id,seasonId:r.season_id,providerUpdatedAt:r.provider_updated_at,fetchedAt:r.fetched_at,persistedAt:r.persisted_at,snapshotHash:r.snapshot_hash,snapshotVersion:r.snapshot_version,ageSeconds:r.age_seconds,lastSuccess:r.last_success_at,lastError:r.last_error,nextAttempt:r.next_attempt_at}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value instanceof Date?value.toISOString():String(value??'Not available')}</dd></div>)}</dl></details>)}
    </section>;
}
