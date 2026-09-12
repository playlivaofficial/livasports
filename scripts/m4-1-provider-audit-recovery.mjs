import pg from 'pg';

const apiKey = process.env.SPORTMONKS_API_KEY?.trim();
const connectionString = process.env.DATABASE_URL?.trim()
  || process.env.DATABASE_POSTGRES_URL?.trim()
  || process.env.POSTGRES_URL?.trim();
if (!apiKey || !connectionString) throw new Error('Server credentials are required');

const pool = new pg.Pool({ connectionString, max: 1 });
let requests = 0;
const log = [];
const get = async (path, query = {}) => {
  if (++requests > 2) throw new Error('Recovery audit request budget exceeded');
  const url = new URL(path, 'https://api.sportmonks.com/v3/');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  log.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), status: response.status,
    code: response.ok ? null : body?.code ?? null,
    message: response.ok ? null : String(body?.message ?? body?.error ?? 'Provider request failed').replaceAll(apiKey, '[REDACTED]') });
  return response.ok ? body?.data : null;
};

try {
  const mapped = await pool.query(`SELECT t.id AS team_id,t.name,tm.provider_entity_id AS provider_team_id,
      s.id AS season_id,sm.provider_entity_id AS provider_season_id
    FROM teams t JOIN provider_entity_mappings tm ON tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' AND tm.livasports_entity_id=t.id
    JOIN team_seasons ts ON ts.team_id=t.id JOIN seasons s ON s.id=ts.season_id JOIN competitions c ON c.id=s.competition_id
    JOIN provider_entity_mappings sm ON sm.provider='SPORTMONKS' AND sm.entity_type='SEASON' AND sm.livasports_entity_id=s.id
    WHERE c.slug='copa-libertadores' AND t.name='Flamengo' ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST LIMIT 1`);
  const sample = mapped.rows[0];
  if (!sample) throw new Error('Mapped Flamengo sample was not found');
  const squadRaw = await get(`football/squads/seasons/${sample.provider_season_id}/teams/${sample.provider_team_id}`, { include: 'player;position' });
  const squad = Array.isArray(squadRaw) ? squadRaw : [];
  const selected = squad.find(row => row.player?.id) ?? squad.find(row => row.player_id);
  const playerId = selected?.player_id ?? selected?.player?.id ?? null;
  const playerRaw = playerId ? await get(`football/players/${playerId}`, {
    include: 'country;nationality;position;detailedPosition;metadata;teams.team;statistics.details.type',
    filters: `playerStatisticSeasons:${sample.provider_season_id}`,
  }) : null;
  const statistics = Array.isArray(playerRaw?.statistics) ? playerRaw.statistics : [];
  console.log(JSON.stringify({ requests, oddsPapiRequests: 0, team: sample.name, canonicalTeamId: sample.team_id,
    squad: { rows: squad.length, withPlayerIdentity: squad.filter(row => row.player?.id).length,
      positions: [...new Set(squad.map(row => row.position?.name).filter(Boolean))],
      sample: squad.slice(0, 8).map(row => ({ playerId: row.player_id ?? row.player?.id ?? null,
        player: row.player?.display_name ?? row.player?.name ?? null, position: row.position?.name ?? null,
        positionId: row.position_id ?? null, jerseyNumber: row.jersey_number ?? null })) },
    player: playerRaw ? { id: playerRaw.id ?? null, displayName: playerRaw.display_name ?? playerRaw.name ?? null,
      image: Boolean(playerRaw.image_path), country: playerRaw.country?.name ?? null, nationality: playerRaw.nationality?.name ?? null,
      position: playerRaw.position?.name ?? null, detailedPosition: playerRaw.detailedPosition?.name ?? null,
      dateOfBirth: playerRaw.date_of_birth ?? null, height: playerRaw.height ?? null, weight: playerRaw.weight ?? null,
      teamRelations: Array.isArray(playerRaw.teams) ? playerRaw.teams.length : 0, statisticRows: statistics.length,
      statisticTypes: statistics.flatMap(row => Array.isArray(row.details) ? row.details.slice(0, 50).map(detail => ({
        typeId: detail.type_id ?? null, name: detail.type?.name ?? null, developerName: detail.type?.developer_name ?? null,
        valueKeys: detail.value && typeof detail.value === 'object' ? Object.keys(detail.value).sort() : [],
      })) : []) } : null, requestLog: log }, null, 2));
} finally {
  await pool.end();
}
