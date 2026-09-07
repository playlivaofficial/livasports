import { databaseUrl, PostgresDatabaseClient } from '@/database/client';

const connectionString = databaseUrl();
if (!connectionString) throw new Error('DATABASE_URL (or the supported Neon server-side fallback) is required');

const db = new PostgresDatabaseClient(connectionString);
try {
  const counts = await db.query(`SELECT
    (SELECT count(*) FROM competitions WHERE enabled)::int AS competitions,
    (SELECT count(*) FROM seasons)::int AS seasons,
    (SELECT count(*) FROM seasons WHERE is_current)::int AS current_seasons,
    (SELECT count(*) FROM teams)::int AS teams,
    (SELECT count(*) FROM fixtures)::int AS fixtures,
    (SELECT count(*) FROM provider_entity_mappings)::int AS mappings`);
  const runs = await db.query(`SELECT sync_kind,status,records_inserted,records_updated,provider_requests,
    started_at,completed_at,error_message,metadata
    FROM ingestion_sync_runs ORDER BY started_at DESC LIMIT 12`);
  const incomplete = await db.query(`SELECT c.slug,c.coverage_status,
    count(DISTINCT ts.team_id)::int AS teams,count(DISTINCT f.id)::int AS fixtures
    FROM competitions c
    LEFT JOIN seasons s ON s.competition_id=c.id
    LEFT JOIN team_seasons ts ON ts.season_id=s.id
    LEFT JOIN fixtures f ON f.competition_id=c.id
    WHERE c.enabled GROUP BY c.id
    HAVING count(DISTINCT ts.team_id)=0 OR count(DISTINCT f.id)=0
    ORDER BY c.priority_br,c.slug`);
  console.info(JSON.stringify({ counts: counts.rows[0], runs: runs.rows, incomplete: incomplete.rows }));
} finally {
  await db.close();
}
