import pg from 'pg';

const apiKey = process.env.SPORTMONKS_API_KEY?.trim();
const connectionString = process.env.DATABASE_URL?.trim()
  || process.env.DATABASE_POSTGRES_URL?.trim()
  || process.env.POSTGRES_URL?.trim();

if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required');
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000 });
let requestCount = 0;
const requestLog = [];

function cleanMessage(value) {
  return String(value ?? 'Provider request failed').replaceAll(apiKey, '[REDACTED]');
}

async function provider(path, query = {}) {
  if (requestCount >= 15) throw new Error('M4.1 capability-audit request budget exceeded');
  const url = new URL(path, 'https://api.sportmonks.com/v3/');
  for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  requestCount++;
  const response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  requestLog.push({ method: 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), status: response.status });
  if (!response.ok) {
    const error = new Error(`SPORTMONKS ${response.status} ${url.pathname}: ${cleanMessage(body?.message ?? body?.error)}`);
    error.status = response.status;
    error.code = body?.code ?? null;
    throw error;
  }
  return body?.data;
}

function array(value) { return Array.isArray(value) ? value : []; }
function summaryType(detail) {
  return { typeId: detail?.type_id ?? null, name: detail?.type?.name ?? null, developerName: detail?.type?.developer_name ?? null,
    valueKeys: detail?.value && typeof detail.value === 'object' ? Object.keys(detail.value).sort() : [] };
}

try {
  const candidates = await pool.query(`SELECT c.slug,t.id AS team_id,t.name,tm.provider_entity_id AS provider_team_id,
      s.id AS season_id,sm.provider_entity_id AS provider_season_id,max(f.kickoff) AS latest_fixture
    FROM competitions c JOIN fixtures f ON f.competition_id=c.id
    JOIN teams t ON t.id=f.home_team_id OR t.id=f.away_team_id
    JOIN seasons s ON s.id=f.season_id
    JOIN provider_entity_mappings tm ON tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' AND tm.livasports_entity_id=t.id
    JOIN provider_entity_mappings sm ON sm.provider='SPORTMONKS' AND sm.entity_type='SEASON' AND sm.livasports_entity_id=s.id
    WHERE c.slug=ANY($1::text[])
    GROUP BY c.slug,t.id,t.name,tm.provider_entity_id,s.id,sm.provider_entity_id,s.is_current
    ORDER BY c.slug,s.is_current DESC,max(f.kickoff) DESC,t.name`, [[
      'brasileirao-serie-a', 'liga-mx', 'premier-league', 'copa-do-brasil', 'copa-libertadores',
    ]]);

  const wanted = [
    ['brasileirao-serie-a', 'Brazil Serie A primary'],
    ['brasileirao-serie-a', 'Brazil Serie A secondary'],
    ['liga-mx', 'Liga MX'],
    ['premier-league', 'Major Europe'],
    ['copa-do-brasil', 'Domestic cup'],
    ['copa-libertadores', 'Continental club'],
  ];
  const used = new Set();
  const samples = wanted.map(([slug, role]) => {
    const row = candidates.rows.find(item => item.slug === slug && !used.has(item.team_id));
    if (!row) throw new Error(`No distinct mapped sample is available for ${role}`);
    used.add(row.team_id);
    return { ...row, role };
  });

  const teams = [];
  for (const sample of samples) {
    const seasonFilter = `teamStatisticSeasons:${sample.provider_season_id}`;
    try {
      const raw = await provider(`football/teams/${sample.provider_team_id}`, {
        include: 'country;venue;coaches;activeSeasons;statistics.details.type', filters: seasonFilter,
      });
      const statistics = array(raw?.statistics);
      teams.push({ role: sample.role, canonicalTeamId: sample.team_id, team: sample.name, providerTeamId: sample.provider_team_id,
        canonicalSeasonId: sample.season_id, providerSeasonId: sample.provider_season_id,
        identity: { id: raw?.id ?? null, name: raw?.name ?? null, shortCode: raw?.short_code ?? null, image: Boolean(raw?.image_path),
          founded: raw?.founded ?? null, country: raw?.country?.name ?? null },
        venue: raw?.venue ? { id: raw.venue.id ?? null, name: raw.venue.name ?? null, city: raw.venue.city_name ?? raw.venue.city?.name ?? null } : null,
        coaches: array(raw?.coaches).map(item => ({ id: item.id ?? item.coach_id ?? null,
          name: item.common_name ?? item.display_name ?? item.name ?? item.coach?.common_name ?? item.coach?.display_name ?? item.coach?.name ?? null })),
        activeSeasonIds: array(raw?.activeSeasons).map(item => item.id), teamStatisticRows: statistics.length,
        teamStatisticTypes: statistics.flatMap(item => array(item.details).slice(0, 40).map(summaryType)),
      });
    } catch (error) {
      teams.push({ role: sample.role, canonicalTeamId: sample.team_id, team: sample.name, providerTeamId: sample.provider_team_id,
        canonicalSeasonId: sample.season_id, providerSeasonId: sample.provider_season_id,
        error: { status: error?.status ?? null, code: error?.code ?? null, message: cleanMessage(error?.message) } });
    }
  }

  const squads = [];
  const playerCandidates = [];
  for (const sample of samples) {
    try {
      const raw = await provider(`football/squads/seasons/${sample.provider_season_id}/teams/${sample.provider_team_id}`, {
        include: 'player;position;detailedPosition',
      });
      const rows = array(raw);
      squads.push({ role: sample.role, canonicalTeamId: sample.team_id, team: sample.name, providerTeamId: sample.provider_team_id,
        providerSeasonId: sample.provider_season_id, rows: rows.length,
        positionIds: [...new Set(rows.map(item => item.position_id).filter(value => value !== null && value !== undefined))],
        withPlayerIdentity: rows.filter(item => item.player?.id).length,
        sample: rows.slice(0, 5).map(item => ({ squadId: item.id ?? null, playerId: item.player_id ?? item.player?.id ?? null,
          playerName: item.player?.display_name ?? item.player?.name ?? null, positionId: item.position_id ?? null,
          position: item.position?.name ?? null, detailedPosition: item.detailedPosition?.name ?? null, jerseyNumber: item.jersey_number ?? null })),
      });
      playerCandidates.push(...rows.map(item => ({ ...item, source: sample })));
    } catch (error) {
      squads.push({ role: sample.role, canonicalTeamId: sample.team_id, team: sample.name, providerTeamId: sample.provider_team_id,
        providerSeasonId: sample.provider_season_id, error: { status: error?.status ?? null, code: error?.code ?? null, message: cleanMessage(error?.message) } });
    }
  }

  const selected = playerCandidates.find(item => item.player?.id) ?? playerCandidates.find(item => item.player_id);
  let player = null;
  if (selected) {
    const playerId = selected.player_id ?? selected.player?.id;
    try {
      const raw = await provider(`football/players/${playerId}`, {
        include: 'country;nationality;position;detailedPosition;metadata;teams.team;statistics.details.type',
        filters: `playerStatisticSeasons:${selected.source.provider_season_id}`,
      });
      player = { providerPlayerId: playerId, sourceTeam: selected.source.name, providerSeasonId: selected.source.provider_season_id,
        identity: { id: raw?.id ?? null, commonName: raw?.common_name ?? null, displayName: raw?.display_name ?? raw?.name ?? null,
          firstname: raw?.firstname ?? null, lastname: raw?.lastname ?? null, image: Boolean(raw?.image_path), dateOfBirth: raw?.date_of_birth ?? null,
          height: raw?.height ?? null, weight: raw?.weight ?? null, country: raw?.country?.name ?? null,
          nationality: raw?.nationality?.name ?? null, position: raw?.position?.name ?? null, detailedPosition: raw?.detailedPosition?.name ?? null },
        teamRelations: array(raw?.teams).map(item => ({ teamId: item.team_id ?? item.team?.id ?? null, team: item.team?.name ?? null,
          start: item.start ?? null, end: item.end ?? null })),
        statisticRows: array(raw?.statistics).length,
        statisticTypes: array(raw?.statistics).flatMap(item => array(item.details).slice(0, 60).map(summaryType)),
        metadata: array(raw?.metadata).map(item => ({ typeId: item.type_id ?? null, valueType: item.value_type ?? null, values: item.values ?? null })),
      };
    } catch (error) {
      player = { providerPlayerId: playerId, error: { status: error?.status ?? null, code: error?.code ?? null, message: cleanMessage(error?.message) } };
    }
  }

  let typeReference;
  try {
    const raw = await provider('core/types/entities');
    typeReference = { available: true, shape: Array.isArray(raw) ? 'array' : typeof raw,
      keys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw).slice(0, 30) : [],
      rows: Array.isArray(raw) ? raw.length : null };
  } catch (error) {
    typeReference = { available: false, error: { status: error?.status ?? null, code: error?.code ?? null, message: cleanMessage(error?.message) } };
  }

  console.log(JSON.stringify({ audit: 'LivaSports M4.1 Sportmonks capability audit', requestBudget: 15, requests: requestCount,
    oddsPapiRequests: 0, samples: teams, squads, player, typeReference, requestLog }, null, 2));
} finally {
  await pool.end();
}
