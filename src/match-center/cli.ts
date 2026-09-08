import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { runMigrations } from '@/database/migrate';
import { HttpSportmonksGateway } from '@/providers/sportmonks/HttpSportmonksGateway';
import { MatchCenterSyncService } from './sync';

const connectionString = databaseUrl();
if (!connectionString) throw new Error('DATABASE_URL is required');
const database = new PostgresDatabaseClient(connectionString);
try {
  const command = process.argv[2] ?? 'sample';
  if (command === 'migrate') {
    console.info(JSON.stringify({ command, migrationsApplied: await runMigrations(database) }));
  } else if (command === 'sample') {
    const apiKey = process.env.SPORTMONKS_API_KEY?.trim();
    if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required');
    const result = await new MatchCenterSyncService(database, new HttpSportmonksGateway(apiKey)).runSample();
    console.info(JSON.stringify({ command, ...result }));
  } else if (command === 'verify') {
    const result = await database.query<Record<string, unknown>>(`SELECT
      (SELECT count(*) FROM competitions WHERE enabled IS TRUE) AS enabled_competitions,
      (SELECT count(*) FROM seasons) AS seasons,
      (SELECT count(*) FROM teams) AS teams,
      (SELECT count(*) FROM fixtures) AS fixtures,
      (SELECT count(*) FROM provider_entity_mappings) AS provider_mappings,
      (SELECT count(*) FROM fixtures WHERE public_id IS NOT NULL) AS public_ids,
      (SELECT count(*) FROM fixture_scores) AS scores,
      (SELECT count(*) FROM fixture_events) AS events,
      (SELECT count(*) FROM fixture_statistics) AS statistics,
      (SELECT count(*) FROM fixture_lineups) AS lineups,
      (SELECT count(*) FROM fixture_formations) AS formations,
      (SELECT count(*) FROM fixture_coaches) AS coaches,
      (SELECT count(*) FROM standings_current) AS standings,
      (SELECT count(*) FROM fixture_detail_sync_state) AS module_states,
      (SELECT count(*) FROM product_events) AS product_events,
      (SELECT count(*) FROM match_center_sync_jobs WHERE status='RUNNING' AND lease_expires_at>now()) AS active_jobs,
      (SELECT count(*) FROM match_center_sync_jobs WHERE status='RUNNING' AND lease_expires_at<=now()) AS stale_jobs,
      (SELECT count(*) FROM (SELECT sport_id,country_id,slug FROM competitions GROUP BY 1,2,3 HAVING count(*)>1) d) AS duplicate_competitions,
      (SELECT count(*) FROM (SELECT competition_id,name FROM seasons GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_seasons,
      (SELECT count(*) FROM (SELECT sport_id,country_id,name FROM teams GROUP BY 1,2,3 HAVING count(*)>1) d) AS duplicate_teams,
      (SELECT count(*) FROM (SELECT competition_id,home_team_id,away_team_id,kickoff FROM fixtures GROUP BY 1,2,3,4 HAVING count(*)>1) d) AS duplicate_fixtures,
      (SELECT count(*) FROM (SELECT provider,entity_type,provider_entity_id FROM provider_entity_mappings GROUP BY 1,2,3 HAVING count(*)>1) d) AS duplicate_provider_mappings,
      (SELECT count(*) FROM (SELECT public_id FROM fixtures GROUP BY public_id HAVING count(*)>1) d) AS duplicate_public_ids,
      (SELECT count(*) FROM (SELECT fixture_id,provider_score_id FROM fixture_scores GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_scores,
      (SELECT count(*) FROM (SELECT fixture_id,provider_event_id FROM fixture_events GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_events,
      (SELECT count(*) FROM (SELECT fixture_id,provider_statistic_id FROM fixture_statistics GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_statistics,
      (SELECT count(*) FROM (SELECT fixture_id,provider_lineup_id FROM fixture_lineups GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_lineups,
      (SELECT count(*) FROM (SELECT fixture_id,team_id FROM fixture_formations GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_formations,
      (SELECT count(*) FROM (SELECT fixture_id,team_id FROM fixture_coaches GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_coaches,
      (SELECT count(*) FROM (SELECT season_id,stage_id,group_id,team_id FROM standings_current GROUP BY 1,2,3,4 HAVING count(*)>1) d) AS duplicate_standings,
      (SELECT count(*) FROM competitions c WHERE c.enabled IS TRUE AND NOT EXISTS (SELECT 1 FROM provider_entity_mappings m WHERE m.provider='SPORTMONKS' AND m.entity_type='COMPETITION' AND m.livasports_entity_id=c.id)) AS canonical_competitions_without_mapping,
      (SELECT count(*) FROM seasons s WHERE NOT EXISTS (SELECT 1 FROM provider_entity_mappings m WHERE m.provider='SPORTMONKS' AND m.entity_type='SEASON' AND m.livasports_entity_id=s.id)) AS canonical_seasons_without_mapping,
      (SELECT count(*) FROM teams t WHERE NOT EXISTS (SELECT 1 FROM provider_entity_mappings m WHERE m.provider='SPORTMONKS' AND m.entity_type='TEAM' AND m.livasports_entity_id=t.id)) AS canonical_teams_without_mapping,
      (SELECT count(*) FROM fixtures f WHERE NOT EXISTS (SELECT 1 FROM provider_entity_mappings m WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND m.livasports_entity_id=f.id)) AS canonical_fixtures_without_mapping,
      (SELECT count(*) FROM provider_entity_mappings m
        LEFT JOIN sports sp ON m.entity_type='SPORT' AND sp.id=m.livasports_entity_id
        LEFT JOIN countries co ON m.entity_type='COUNTRY' AND co.id=m.livasports_entity_id
        LEFT JOIN competitions c ON m.entity_type='COMPETITION' AND c.id=m.livasports_entity_id
        LEFT JOIN seasons se ON m.entity_type='SEASON' AND se.id=m.livasports_entity_id
        LEFT JOIN teams t ON m.entity_type='TEAM' AND t.id=m.livasports_entity_id
        LEFT JOIN fixtures f ON m.entity_type='FIXTURE' AND f.id=m.livasports_entity_id
        LEFT JOIN bookmakers b ON m.entity_type='BOOKMAKER' AND b.id=m.livasports_entity_id
        LEFT JOIN markets ma ON m.entity_type='MARKET' AND ma.id=m.livasports_entity_id
        WHERE (m.entity_type='SPORT' AND sp.id IS NULL) OR (m.entity_type='COUNTRY' AND co.id IS NULL)
          OR (m.entity_type='COMPETITION' AND c.id IS NULL) OR (m.entity_type='SEASON' AND se.id IS NULL)
          OR (m.entity_type='TEAM' AND t.id IS NULL) OR (m.entity_type='FIXTURE' AND f.id IS NULL)
          OR (m.entity_type='BOOKMAKER' AND b.id IS NULL) OR (m.entity_type='MARKET' AND ma.id IS NULL)) AS unmaterialized_provider_identity_reservations`);
    console.info(JSON.stringify({ command, ...result.rows[0] }));
    const jobs = await database.query(`SELECT id,status,resume_cursor,total_fixtures,processed_fixtures,provider_requests,started_at,heartbeat_at,lease_expires_at,completed_at,error_message
      FROM match_center_sync_jobs ORDER BY started_at DESC LIMIT 3`);
    const modules = await database.query(`SELECT c.slug,f.public_id,s.module,s.state,count(*) OVER(PARTITION BY f.id) AS module_count
      FROM fixture_detail_sync_state s JOIN fixtures f ON f.id=s.fixture_id JOIN competitions c ON c.id=f.competition_id ORDER BY c.slug,s.module`);
    const byCompetition = await database.query(`SELECT c.slug,c.display_name_pt_br,c.display_name_es_mx,count(DISTINCT f.id) AS fixtures,
      count(DISTINCT CASE WHEN f.status='SCHEDULED' THEN f.id END) AS scheduled,
      count(DISTINCT CASE WHEN f.status='FINISHED' THEN f.id END) AS finished,
      count(DISTINCT fe.fixture_id) AS fixtures_with_events,count(DISTINCT fs.fixture_id) AS fixtures_with_statistics,
      count(DISTINCT fl.fixture_id) AS fixtures_with_lineups
      FROM competitions c LEFT JOIN fixtures f ON f.competition_id=c.id
      LEFT JOIN (SELECT DISTINCT fixture_id FROM fixture_events) fe ON fe.fixture_id=f.id
      LEFT JOIN (SELECT DISTINCT fixture_id FROM fixture_statistics) fs ON fs.fixture_id=f.id
      LEFT JOIN (SELECT DISTINCT fixture_id FROM fixture_lineups) fl ON fl.fixture_id=f.id
      WHERE c.enabled IS TRUE GROUP BY c.id,c.slug,c.display_name_pt_br,c.display_name_es_mx ORDER BY c.priority_br,c.slug`);
    const orphanMappings = await database.query(`SELECT m.entity_type,count(*) AS count FROM provider_entity_mappings m
      LEFT JOIN sports sp ON m.entity_type='SPORT' AND sp.id=m.livasports_entity_id
      LEFT JOIN countries co ON m.entity_type='COUNTRY' AND co.id=m.livasports_entity_id
      LEFT JOIN competitions c ON m.entity_type='COMPETITION' AND c.id=m.livasports_entity_id
      LEFT JOIN seasons se ON m.entity_type='SEASON' AND se.id=m.livasports_entity_id
      LEFT JOIN teams t ON m.entity_type='TEAM' AND t.id=m.livasports_entity_id
      LEFT JOIN fixtures f ON m.entity_type='FIXTURE' AND f.id=m.livasports_entity_id
      LEFT JOIN bookmakers b ON m.entity_type='BOOKMAKER' AND b.id=m.livasports_entity_id
      LEFT JOIN markets ma ON m.entity_type='MARKET' AND ma.id=m.livasports_entity_id
      WHERE (m.entity_type='SPORT' AND sp.id IS NULL) OR (m.entity_type='COUNTRY' AND co.id IS NULL)
        OR (m.entity_type='COMPETITION' AND c.id IS NULL) OR (m.entity_type='SEASON' AND se.id IS NULL)
        OR (m.entity_type='TEAM' AND t.id IS NULL) OR (m.entity_type='FIXTURE' AND f.id IS NULL)
        OR (m.entity_type='BOOKMAKER' AND b.id IS NULL) OR (m.entity_type='MARKET' AND ma.id IS NULL)
      GROUP BY m.entity_type ORDER BY m.entity_type`);
    console.info(JSON.stringify({ jobs: jobs.rows, modules: modules.rows, orphanMappings: orphanMappings.rows, byCompetition: byCompetition.rows }));
  } else throw new Error('Unknown M4 command');
} finally {
  await database.close();
}
