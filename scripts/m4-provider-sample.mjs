const token = process.env.SPORTMONKS_API_KEY;
if (!token) throw new Error('SPORTMONKS_API_KEY is not configured');

const fixtureIds = process.argv.slice(2).filter(value => /^\d+$/.test(value));
if (!fixtureIds.length) throw new Error('Provide one or more numeric fixture IDs');
if (fixtureIds.length > 6) throw new Error('The diagnostic is capped at six fixtures');

const include = [
  'participants', 'state', 'scores', 'season', 'league', 'round', 'stage', 'group', 'venue',
  'events.type', 'statistics.type', 'lineups', 'formations', 'coaches',
].join(';');
const safeText = value => typeof value === 'string' ? value.replaceAll(token,'[REDACTED]') : 'Provider request failed';
const summaries = [];
for (const fixtureId of fixtureIds) {
  const url = new URL(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`);
  url.searchParams.set('include', include);
  const response = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    summaries.push({ fixtureId, status: response.status, code: body?.code ?? null,
      message: safeText(body?.message) });
    continue;
  }
  const row = body?.data ?? {};
  summaries.push({ fixtureId, status: response.status, startingAt: row.starting_at ?? null,
    state: row.state?.developer_name ?? row.state?.name ?? null,
    participants: Array.isArray(row.participants) ? row.participants.map(item => ({ id: item.id, location: item.meta?.location ?? null })) : [],
    scores: Array.isArray(row.scores) ? row.scores.length : 0,
    scoreSample: Array.isArray(row.scores) ? row.scores.slice(0, 10).map(item => ({
      id: item.id ?? null, participantId: item.participant_id ?? null, description: item.description ?? null,
      goals: item.score?.goals ?? null,
    })) : [],
    events: Array.isArray(row.events) ? row.events.length : 0,
    eventKeys: Array.isArray(row.events) && row.events[0] ? Object.keys(row.events[0]).sort() : [],
    eventSample: Array.isArray(row.events) ? row.events.slice(0, 4).map(item => ({
      id: item.id ?? null, typeId: item.type_id ?? null, type: item.type?.name ?? item.type?.developer_name ?? null,
      minute: item.minute ?? null, extraMinute: item.extra_minute ?? null, participantId: item.participant_id ?? null,
      playerName: item.player_name ?? null, relatedPlayerName: item.related_player_name ?? null,
      result: item.result ?? null, rescinded: item.rescinded ?? false,
    })) : [],
    statistics: Array.isArray(row.statistics) ? row.statistics.length : 0,
    statisticKeys: Array.isArray(row.statistics) && row.statistics[0] ? Object.keys(row.statistics[0]).sort() : [],
    statisticSample: Array.isArray(row.statistics) ? row.statistics.slice(0, 8).map(item => ({
      id: item.id ?? null, typeId: item.type_id ?? null, type: item.type?.name ?? item.type?.developer_name ?? null,
      participantId: item.participant_id ?? null, location: item.location ?? null, data: item.data ?? null,
    })) : [],
    lineups: Array.isArray(row.lineups) ? row.lineups.length : 0,
    lineupKeys: Array.isArray(row.lineups) && row.lineups[0] ? Object.keys(row.lineups[0]).sort() : [],
    lineupSample: Array.isArray(row.lineups) ? row.lineups.slice(0, 3).map(item => ({
      id: item.id ?? null, playerId: item.player_id ?? null, playerName: item.player_name ?? null,
      teamId: item.team_id ?? null, typeId: item.type_id ?? null, jerseyNumber: item.jersey_number ?? null,
      formationField: item.formation_field ?? null, formationPosition: item.formation_position ?? null,
    })) : [],
    formations: Array.isArray(row.formations) ? row.formations.length : 0,
    coaches: Array.isArray(row.coaches) ? row.coaches.length : 0,
    venue: row.venue ? { id: row.venue.id ?? null, name: row.venue.name ?? null, city: row.venue.city_name ?? null } : null,
    round: row.round ? { id: row.round.id ?? null, name: row.round.name ?? null } : null,
    stage: row.stage ? { id: row.stage.id ?? null, name: row.stage.name ?? null } : null,
    group: row.group ? { id: row.group.id ?? null, name: row.group.name ?? null } : null,
    seasonId: row.season_id ?? row.season?.id ?? null,
  });
}
console.log(JSON.stringify({ requests: fixtureIds.length, summaries }, null, 2));
