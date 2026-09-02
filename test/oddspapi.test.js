import test from 'node:test';
import assert from 'node:assert/strict';
import { OddsPapiAdapter, OddsPapiHttpError } from '../src/provider/OddsPapiAdapter.js';
import { buildOddsPapiReport } from '../src/oddspapi-report.js';

test('normalizes OddsPapi v4 1X2 without leaking provider IDs', () => {
  const adapter = new OddsPapiAdapter({ apiKey: 'test-key', cooldownMs: 0 });
  const markets = [{ marketId: 101, marketName: 'Full Time Result', marketType: '1x2', period: 'fulltime', handicap: 0,
    outcomes: [{ outcomeId: 101, outcomeName: '1' }, { outcomeId: 102, outcomeName: 'X' }, { outcomeId: 103, outcomeName: '2' }] }];
  const outcomes = Object.fromEntries([101, 102, 103].map((id, i) => [id, { players: { 0: { active: true, price: 1.5 + i, changedAt: '2026-09-02T10:00:00Z' } } }]));
  const fixtures = [{ fixtureId: 'f1', tournamentName: 'Serie A', sportName: 'Soccer', categoryName: 'Brazil',
    participant1Name: 'Home', participant2Name: 'Away', startTime: '2026-09-03T10:00:00Z', bookmakerOdds: {
      'betano.bet.br': { markets: { 101: { marketActive: true, outcomes } } },
    } }];
  const result = adapter.normalizeOdds(fixtures, markets);
  assert.deepEqual(result.odds.map(o => o.outcome), ['HOME', 'DRAW', 'AWAY']);
  assert.deepEqual(Object.keys(result.odds[0]), ['fixtureId', 'league', 'sport', 'homeTeam', 'awayTeam', 'kickoff', 'bookmaker', 'market', 'outcome', 'line', 'decimalOdds', 'providerUpdatedAt']);
});

test('sole-provider verdict stays partial when odds pass but Match Center endpoints are missing', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => ({ fixtureId: String(i), league: 'Serie A', country: 'Brazil' }));
  const odds = fixtures.flatMap(f => ['betano.bet.br', 'betsson'].flatMap(bookmaker => ['HOME', 'DRAW', 'AWAY'].map(outcome => ({ ...f, bookmaker, market: 'MATCH_WINNER', outcome }))));
  const report = buildOddsPapiReport({ football: { fixtures, odds }, basketball: { fixtures: [], odds: [] }, account: {}, requests: {} });
  assert.equal(report.overallVerdict, 'PARTIAL PASS — OddsPapi is suitable for odds but a separate football-data provider is still required');
});

test('blocked execution uses an allowed exact business verdict', () => {
  const report = buildOddsPapiReport(null, { executionStatus: 'NOT_EXECUTED' });
  assert.equal(report.overallVerdict, 'NOT EXECUTED');
  assert.ok(report.football.bookmakerCoverage.every(x => x.status === 'NOT EXECUTED'));
});

test('HTTP errors preserve full JSON diagnostics while redacting the API key', async () => {
  const secret = 'super-secret-value';
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({
    code: 'VALIDATION_ERROR', message: { field: 'bookmakers', detail: `invalid; key=${secret}` }, extra: { expected: 'string' }, apiKey: secret,
  }) });
  const adapter = new OddsPapiAdapter({ apiKey: secret, fetchImpl, cooldownMs: 0 });
  const originalError = console.error; console.error = () => {};
  try {
    await assert.rejects(adapter.request('/fixtures', { tournamentId: 1, bookmakers: 'betsson' }), error => {
      assert.ok(error instanceof OddsPapiHttpError);
      assert.equal(error.path, '/v4/fixtures');
      assert.equal(error.providerCode, 'VALIDATION_ERROR');
      assert.equal(error.body.extra.expected, 'string');
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.deepEqual(error.query, { tournamentId: '1', bookmakers: 'betsson' });
      return true;
    });
  } finally { console.error = originalError; }
});

test('uses singular bookmaker odds requests and skips an empty Liga MX tournament', async () => {
  const requests = [];
  const account = { current_subscription_id: 1, subscriptions: [{ subscription_id: 1, is_active: true,
    request_count: 10, request_limit: 5000, sport_ids: [10], bookmakers: {} }] };
  const fetchImpl = async url => {
    const parsed = new URL(url);
    requests.push({ path: parsed.pathname, query: Object.fromEntries(parsed.searchParams) });
    const ok = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (parsed.pathname.endsWith('/account')) return ok(account);
    if (parsed.pathname.endsWith('/tournaments')) return ok([
      { tournamentId: 325, tournamentName: 'Brasileiro Serie A', tournamentSlug: 'brasileiro-serie-a', categoryName: 'Brazil', categorySlug: 'brazil' },
      { tournamentId: 352, tournamentName: 'Primera Division', tournamentSlug: 'primera-division', categoryName: 'Mexico', categorySlug: 'mexico' },
    ]);
    if (parsed.pathname.endsWith('/fixtures') && parsed.searchParams.get('tournamentId') === '352') {
      return { ok: false, status: 404, text: async () => JSON.stringify({ code: 'FIXTURE_NOT_FOUND', message: 'No fixtures' }) };
    }
    if (parsed.pathname.endsWith('/fixtures')) return ok([{ fixtureId: 'f1', tournamentId: 325, tournamentName: 'Brasileiro Serie A', categoryName: 'Brazil', statusId: 0 }]);
    if (parsed.pathname.endsWith('/markets') || parsed.pathname.endsWith('/odds-by-tournaments')) return ok([]);
    throw new Error(`Unexpected path ${parsed.pathname}`);
  };
  const originalError = console.error; console.error = () => {};
  try {
    const adapter = new OddsPapiAdapter({ apiKey: 'test-key', fetchImpl, cooldownMs: 0 });
    const sample = await adapter.collectValidationSample({ basketballFixtureLimit: 0 });
    const oddsRequests = requests.filter(r => r.path.endsWith('/odds-by-tournaments'));
    assert.deepEqual(oddsRequests.map(r => r.query.bookmaker), ['betano.bet.br', 'betsson']);
    assert.ok(oddsRequests.every(r => !('bookmakers' in r.query)));
    assert.equal(sample.football.tournamentIdentification.mexico.tournamentId, 352);
    assert.equal(sample.football.fixtureCountsByTournament.find(r => r.tournamentId === 352).status, 'NO SAMPLE');
    assert.equal(sample.validationStages.find(s => s.name === 'pregame fixtures: Primera Division').status, 'SKIPPED');
  } finally { console.error = originalError; }
});
