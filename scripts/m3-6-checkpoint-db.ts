import { databaseUrl, PostgresDatabaseClient } from '@/database/client';

const connectionString = databaseUrl();
if (!connectionString) throw new Error('DATABASE_URL (or the supported Neon server-side fallback) is required');
const summaryOnly = process.argv.includes('--summary');

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
    FROM ingestion_sync_runs ORDER BY started_at DESC LIMIT ${summaryOnly ? 6 : 12}`);
  const runningRuns = await db.query(`SELECT sync_kind,target_key,started_at
    FROM ingestion_sync_runs WHERE status='RUNNING' ORDER BY started_at`);
  const incomplete = await db.query(`SELECT c.slug,c.coverage_status,
    count(DISTINCT ts.team_id)::int AS teams,count(DISTINCT f.id)::int AS fixtures
    FROM competitions c
    LEFT JOIN seasons s ON s.competition_id=c.id
    LEFT JOIN team_seasons ts ON ts.season_id=s.id
    LEFT JOIN fixtures f ON f.competition_id=c.id
    WHERE c.enabled GROUP BY c.id
    HAVING count(DISTINCT ts.team_id)=0 OR count(DISTINCT f.id)=0
    ORDER BY c.priority_br,c.slug`);
  const byCompetition = await db.query(`SELECT c.slug,c.canonical_name AS name,c.coverage_status,
    count(DISTINCT s.id)::int AS seasons,
    count(DISTINCT s.id) FILTER (WHERE s.is_current)::int AS current_seasons,
    count(DISTINCT ts.team_id)::int AS teams,count(DISTINCT f.id)::int AS fixtures
    FROM competitions c
    LEFT JOIN seasons s ON s.competition_id=c.id
    LEFT JOIN team_seasons ts ON ts.season_id=s.id
    LEFT JOIN fixtures f ON f.competition_id=c.id
    WHERE c.enabled GROUP BY c.id ORDER BY c.priority_br,c.slug`);
  const duplicates = await db.query(`SELECT
    (SELECT count(*)::int FROM (SELECT slug FROM competitions GROUP BY slug HAVING count(*) > 1) duplicate) AS competition_slug_groups,
    (SELECT count(*)::int FROM (SELECT competition_id,name FROM seasons GROUP BY competition_id,name HAVING count(*) > 1) duplicate) AS season_groups,
    (SELECT count(*)::int FROM (SELECT sport_id,country_id,name FROM teams GROUP BY sport_id,country_id,name HAVING count(*) > 1) duplicate) AS team_groups,
    (SELECT count(*)::int FROM (SELECT competition_id,home_team_id,away_team_id,kickoff FROM fixtures GROUP BY competition_id,home_team_id,away_team_id,kickoff HAVING count(*) > 1) duplicate) AS fixture_groups,
    (SELECT count(*)::int FROM (SELECT provider,entity_type,provider_entity_id FROM provider_entity_mappings GROUP BY provider,entity_type,provider_entity_id HAVING count(*) > 1) duplicate) AS provider_reference_groups,
    (SELECT count(*)::int FROM (SELECT provider,entity_type,livasports_entity_id FROM provider_entity_mappings GROUP BY provider,entity_type,livasports_entity_id HAVING count(*) > 1) duplicate) AS internal_mapping_groups,
    (SELECT count(*)::int FROM teams entity LEFT JOIN provider_entity_mappings mapping
      ON mapping.provider='SPORTMONKS' AND mapping.entity_type='TEAM' AND mapping.livasports_entity_id=entity.id
      WHERE mapping.id IS NULL) AS teams_without_sportmonks_mapping,
    (SELECT count(*)::int FROM fixtures entity LEFT JOIN provider_entity_mappings mapping
      ON mapping.provider='SPORTMONKS' AND mapping.entity_type='FIXTURE' AND mapping.livasports_entity_id=entity.id
      WHERE mapping.id IS NULL) AS fixtures_without_sportmonks_mapping`);
  const orphanCountryMappings = await db.query(`SELECT p.provider_entity_id,p.livasports_entity_id,
    p.metadata->>'code' AS code,p.metadata->>'name' AS name
    FROM provider_entity_mappings p LEFT JOIN countries c ON c.id=p.livasports_entity_id
    WHERE p.provider='SPORTMONKS' AND p.entity_type='COUNTRY' AND c.id IS NULL
    ORDER BY p.provider_entity_id`);
  console.info(JSON.stringify({ counts: counts.rows[0], byCompetition: byCompetition.rows, duplicates: duplicates.rows[0],
    runs: summaryOnly ? runs.rows.map(run => ({ ...run, metadata: undefined })) : runs.rows,
    runningRuns: runningRuns.rows, incomplete: incomplete.rows, orphanCountryMappings: orphanCountryMappings.rows }));
} finally {
  await db.close();
}
