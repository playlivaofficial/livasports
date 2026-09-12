import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { runMigrations } from '@/database/migrate';
import { SportmonksProfileAdapter } from './provider';
import { ProfileSyncService } from './sync';

const connectionString = databaseUrl();
if (!connectionString) throw new Error('DATABASE_URL is required');
const database = new PostgresDatabaseClient(connectionString);

try {
  const command = process.argv[2] ?? 'verify';
  if (command === 'migrate') {
    console.info(JSON.stringify({ command, migrationsApplied: await runMigrations(database) }));
  } else if (command === 'sample') {
    const apiKey = process.env.SPORTMONKS_API_KEY?.trim();
    if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required');
    const provider = new SportmonksProfileAdapter(apiKey, 20);
    console.info(JSON.stringify({ command, ...await new ProfileSyncService(database, provider).runSample(), oddsPapiRequests: 0 }));
  } else if (command === 'link') {
    const provider = { team: async()=>null,squad:async()=>[],player:async()=>null,fixturePlayerStatistics:async()=>[],requestCount:()=>0 };
    console.info(JSON.stringify({ command, ...await new ProfileSyncService(database, provider).linkPersistedFixturePlayers(), oddsPapiRequests: 0 }));
  } else if (command === 'routes') {
    const teams = await database.query(`SELECT t.name,t.public_id,t.profile_state,count(DISTINCT sm.player_id) AS squad_players,
      count(DISTINCT ts.provider_type_id) AS statistics FROM teams t LEFT JOIN team_squad_memberships sm ON sm.team_id=t.id
      LEFT JOIN team_season_statistics ts ON ts.team_id=t.id WHERE t.profile_state<>'NOT_YET_INGESTED'
      GROUP BY t.id ORDER BY t.name`);
    const players = await database.query(`SELECT p.display_name,p.public_id,p.profile_state,p.image_url IS NOT NULL AS has_photo,
      count(DISTINCT sm.team_id) AS squad_teams,count(DISTINCT ps.provider_type_id) AS statistics,count(DISTINCT fl.fixture_id) AS matches
      FROM players p LEFT JOIN team_squad_memberships sm ON sm.player_id=p.id LEFT JOIN player_season_statistics ps ON ps.player_id=p.id
      LEFT JOIN fixture_lineups fl ON fl.player_entity_id=p.id GROUP BY p.id
      ORDER BY (count(DISTINCT ps.provider_type_id)>0 AND count(DISTINCT fl.fixture_id)>0) DESC,
        count(DISTINCT ps.provider_type_id) DESC,count(DISTINCT fl.fixture_id) DESC,p.display_name LIMIT 16`);
    const matches = await database.query(`SELECT c.slug,f.public_id,ht.name AS home,at.name AS away,count(DISTINCT fl.player_entity_id) AS linked_players
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      JOIN fixture_lineups fl ON fl.fixture_id=f.id AND fl.player_entity_id IS NOT NULL
      GROUP BY c.slug,f.id,ht.id,at.id ORDER BY count(DISTINCT fl.player_entity_id) DESC,f.kickoff DESC LIMIT 12`);
    console.info(JSON.stringify({ command, teams: teams.rows, players: players.rows, matches: matches.rows }));
  } else if (command === 'verify') {
    const result = await database.query<Record<string, unknown>>(`SELECT
      (SELECT count(*) FROM teams) AS canonical_teams,
      (SELECT count(*) FROM teams WHERE public_id IS NOT NULL) AS team_public_ids,
      (SELECT count(*) FROM players) AS canonical_players,
      (SELECT count(*) FROM player_provider_mappings) AS player_mappings,
      (SELECT count(*) FROM team_squad_memberships) AS squad_memberships,
      (SELECT count(*) FROM team_season_statistics) AS team_statistics,
      (SELECT count(*) FROM player_season_statistics) AS player_statistics,
      (SELECT count(*) FROM fixture_player_statistics) AS fixture_player_statistics,
      (SELECT count(*) FROM fixture_lineups WHERE player_entity_id IS NOT NULL) AS linked_lineups,
      (SELECT count(*) FROM fixture_events WHERE player_entity_id IS NOT NULL) AS linked_events,
      (SELECT count(*) FROM profile_sync_state) AS profile_states,
      (SELECT count(*) FROM profile_sponsor_campaigns WHERE enabled) AS active_sponsors,
      (SELECT count(*) FROM profile_sync_jobs WHERE status='RUNNING' AND lease_expires_at>now()) AS active_jobs,
      (SELECT count(*) FROM profile_sync_jobs WHERE status='RUNNING' AND lease_expires_at<=now()) AS stale_jobs,
      (SELECT count(*) FROM (SELECT public_id FROM teams GROUP BY 1 HAVING count(*)>1)d) AS duplicate_team_public_ids,
      (SELECT count(*) FROM (SELECT public_id FROM players GROUP BY 1 HAVING count(*)>1)d) AS duplicate_player_public_ids,
      (SELECT count(*) FROM (SELECT provider,provider_player_id FROM player_provider_mappings GROUP BY 1,2 HAVING count(*)>1)d) AS duplicate_player_mappings,
      (SELECT count(*) FROM (SELECT team_id,season_id,player_id FROM team_squad_memberships GROUP BY 1,2,3 HAVING count(*)>1)d) AS duplicate_squad_memberships,
      (SELECT count(*) FROM (SELECT team_id,season_id,provider_type_id FROM team_season_statistics GROUP BY 1,2,3 HAVING count(*)>1)d) AS duplicate_team_statistics,
      (SELECT count(*) FROM (SELECT player_id,team_id,season_id,provider_type_id FROM player_season_statistics GROUP BY 1,2,3,4 HAVING count(*)>1)d) AS duplicate_player_statistics,
      (SELECT count(*) FROM (SELECT fixture_id,player_id,provider_type_id FROM fixture_player_statistics GROUP BY 1,2,3 HAVING count(*)>1)d) AS duplicate_fixture_player_statistics,
      (SELECT count(*) FROM player_provider_mappings m LEFT JOIN players p ON p.id=m.player_id WHERE p.id IS NULL) AS orphan_player_mappings,
      (SELECT count(*) FROM team_squad_memberships sm LEFT JOIN teams t ON t.id=sm.team_id LEFT JOIN seasons s ON s.id=sm.season_id LEFT JOIN players p ON p.id=sm.player_id
        WHERE t.id IS NULL OR s.id IS NULL OR p.id IS NULL) AS orphan_squad_memberships,
      (SELECT count(*) FROM team_season_statistics ts LEFT JOIN teams t ON t.id=ts.team_id LEFT JOIN seasons s ON s.id=ts.season_id LEFT JOIN competitions c ON c.id=ts.competition_id
        WHERE t.id IS NULL OR s.id IS NULL OR c.id IS NULL) AS orphan_team_statistics,
      (SELECT count(*) FROM player_season_statistics ps LEFT JOIN players p ON p.id=ps.player_id LEFT JOIN teams t ON t.id=ps.team_id LEFT JOIN seasons s ON s.id=ps.season_id
        LEFT JOIN competitions c ON c.id=ps.competition_id WHERE p.id IS NULL OR t.id IS NULL OR s.id IS NULL OR c.id IS NULL) AS orphan_player_statistics,
      (SELECT count(*) FROM fixture_player_statistics fps LEFT JOIN fixtures f ON f.id=fps.fixture_id LEFT JOIN players p ON p.id=fps.player_id
        LEFT JOIN teams t ON t.id=fps.team_id WHERE f.id IS NULL OR p.id IS NULL OR t.id IS NULL) AS orphan_fixture_player_statistics,
      (SELECT count(*) FROM profile_sync_state ps WHERE (ps.entity_type='TEAM' AND NOT EXISTS(SELECT 1 FROM teams t WHERE t.id=ps.entity_id))
        OR (ps.entity_type='PLAYER' AND NOT EXISTS(SELECT 1 FROM players p WHERE p.id=ps.entity_id))) AS orphan_profile_states,
      (SELECT count(*) FROM (SELECT display_name FROM players GROUP BY 1 HAVING count(*)>1)d) AS same_name_player_groups,
      (SELECT count(*) FROM (SELECT player_id FROM team_squad_memberships GROUP BY 1 HAVING count(DISTINCT team_id)>1)d) AS players_with_multiple_teams,
      (SELECT count(*) FROM (SELECT player_id FROM player_season_statistics GROUP BY 1 HAVING count(DISTINCT competition_id)>1)d) AS players_with_multiple_competitions,
      (SELECT count(*) FROM players WHERE image_url IS NULL) AS players_missing_photo,
      (SELECT count(*) FROM players WHERE date_of_birth IS NULL) AS players_missing_dob,
      (SELECT count(DISTINCT ts.team_id) FROM team_seasons ts JOIN seasons s ON s.id=ts.season_id WHERE s.is_current) AS teams_in_current_seasons,
      (SELECT count(DISTINCT team_id) FROM (SELECT home_team_id AS team_id FROM fixtures WHERE kickoff BETWEEN now()-interval '90 days' AND now()+interval '90 days'
        UNION SELECT away_team_id FROM fixtures WHERE kickoff BETWEEN now()-interval '90 days' AND now()+interval '90 days') recent) AS teams_with_recent_or_upcoming_fixtures`);
    const jobs = await database.query(`SELECT id,status,total_targets,processed_targets,provider_requests,records_inserted,records_updated,started_at,completed_at,error_message
      FROM profile_sync_jobs ORDER BY started_at DESC LIMIT 3`);
    const coverage = await database.query(`SELECT t.name,t.public_id,t.profile_state,count(DISTINCT sm.player_id) AS squad_players,
      count(DISTINCT ts.provider_type_id) AS team_stats FROM teams t LEFT JOIN team_squad_memberships sm ON sm.team_id=t.id
      LEFT JOIN team_season_statistics ts ON ts.team_id=t.id WHERE t.profile_state<>'NOT_YET_INGESTED'
      GROUP BY t.id ORDER BY t.name`);
    const playerCoverage = await database.query(`SELECT p.display_name,p.public_id,p.profile_state,p.position_name,p.image_url IS NOT NULL AS has_photo,
      p.date_of_birth IS NOT NULL AS has_dob,count(DISTINCT sm.team_id) AS team_contexts,count(DISTINCT ps.competition_id) AS statistic_competitions,
      count(DISTINCT ps.provider_type_id) AS season_statistics,count(DISTINCT fl.fixture_id) AS linked_matches
      FROM players p LEFT JOIN team_squad_memberships sm ON sm.player_id=p.id LEFT JOIN player_season_statistics ps ON ps.player_id=p.id
      LEFT JOIN fixture_lineups fl ON fl.player_entity_id=p.id WHERE p.profile_state<>'NOT_YET_INGESTED'
      GROUP BY p.id ORDER BY p.display_name`);
    console.info(JSON.stringify({ command, ...result.rows[0], jobs: jobs.rows, coverage: coverage.rows, players: playerCoverage.rows }));
  } else throw new Error('Unknown M4.1 command');
} finally {
  await database.close();
}
