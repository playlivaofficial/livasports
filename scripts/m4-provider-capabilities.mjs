const token = process.env.SPORTMONKS_API_KEY;
if (!token) throw new Error('SPORTMONKS_API_KEY is not configured');
const [seasonId, homeId, awayId] = process.argv.slice(2);
if (![seasonId, homeId, awayId].every(value => /^\d+$/.test(value ?? ''))) {
  throw new Error('Provide numeric season, home-team, and away-team IDs');
}
const safeText = value => typeof value === 'string' ? value.replaceAll(token,'[REDACTED]') : 'Provider request failed';

async function provider(path, query = {}) {
  const url = new URL(path, 'https://api.sportmonks.com/v3/');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, data: body?.data ?? null,
    code: response.ok ? null : body?.code ?? null,
    message: response.ok ? null : safeText(body?.message) };
}

const standings = await provider(`football/standings/seasons/${seasonId}`, { include: 'participant;details.type;stage;group' });
const h2h = await provider(`football/fixtures/head-to-head/${homeId}/${awayId}`, { include: 'participants;state;scores', per_page: '5' });
const standingsRows = Array.isArray(standings.data) ? standings.data : [];
const h2hRows = Array.isArray(h2h.data) ? h2h.data : [];
console.log(JSON.stringify({ requests: 2,
  standings: { status: standings.status, code: standings.code, message: standings.message, rows: standingsRows.length,
    keys: standingsRows[0] ? Object.keys(standingsRows[0]).sort() : [],
    sample: standingsRows.slice(0, 2).map(row => ({ id: row.id ?? null, participantId: row.participant_id ?? null,
      position: row.position ?? null, stageId: row.stage_id ?? null, groupId: row.group_id ?? null,
      details: Array.isArray(row.details) ? row.details.slice(0, 12).map(item => ({
        typeId: item.type_id ?? null, type: item.type?.name ?? item.type?.developer_name ?? null,
        value: item.value ?? null,
      })) : [],
    })) },
  h2h: { status: h2h.status, code: h2h.code, message: h2h.message, rows: h2hRows.length,
    sample: h2hRows.slice(0, 3).map(row => ({ id: row.id ?? null, startingAt: row.starting_at ?? null,
      state: row.state?.developer_name ?? null, participants: Array.isArray(row.participants) ? row.participants.map(item => ({ id: item.id, location: item.meta?.location ?? null })) : [],
      scores: Array.isArray(row.scores) ? row.scores.filter(item => item.description === 'CURRENT').map(item => ({ participantId: item.participant_id, goals: item.score?.goals ?? null })) : [],
    })) },
}, null, 2));
