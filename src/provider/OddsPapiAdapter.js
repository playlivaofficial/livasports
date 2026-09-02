import { ProviderAdapter } from './ProviderAdapter.js';

const DEFAULT_BOOKMAKERS = ['betano.bet.br', 'betsson'];
const FOOTBALL_TOURNAMENTS = [
  { label: 'Brazil Serie A', country: 'Brazil', match: /(?:brasileir[aã]o|serie a)/i },
  { label: 'Copa do Brasil', country: 'Brazil', match: /copa do brasil/i },
  { label: 'Copa Libertadores', country: 'South America', match: /libertadores/i },
  { label: 'Liga MX', country: 'Mexico', match: /liga mx|primera division/i },
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const asArray = value => {
  if (Array.isArray(value)) return value;
  if (value?.data) return asArray(value.data);
  if (!value) return [];
  if (value.fixtureId || value.sportId || value.tournamentId || value.marketId) return [value];
  const values = Object.values(value);
  return values.length && values.every(item => item && typeof item === 'object') ? values : [value];
};
const compact = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function activeSubscription(account) {
  return account?.subscriptions?.find(s => s.subscription_id === account.current_subscription_id)
    ?? account?.subscriptions?.find(s => s.is_active)
    ?? null;
}

function sanitize(value, secret) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return secret ? value.split(secret).join('[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(item => sanitize(item, secret));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /api.?key|token|authorization/i.test(key) ? '[REDACTED]' : sanitize(item, secret),
  ]));
  return value;
}

function providerErrorParts(body) {
  const candidates = [body?.code, body?.error?.code, body?.detail?.code, body?.message?.code];
  const messages = [body?.message, body?.error?.message, body?.error, body?.details, body?.detail];
  const code = candidates.find(value => typeof value === 'string' || typeof value === 'number') ?? null;
  const messageValue = messages.find(value => value !== undefined && value !== null);
  const message = typeof messageValue === 'string' ? messageValue
    : messageValue === undefined ? null : JSON.stringify(messageValue);
  return { code, message };
}

export class OddsPapiHttpError extends Error {
  constructor({ status, method, path, query, body, providerCode, providerMessage }) {
    const summary = providerMessage ?? `HTTP ${status}`;
    super(`OddsPapi ${status} ${method} ${path}: ${summary}`);
    this.name = 'OddsPapiHttpError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.query = query;
    this.body = body;
    this.providerCode = providerCode;
    this.providerMessage = providerMessage;
  }

  toJSON() {
    return { name: this.name, status: this.status, method: this.method, path: this.path, query: this.query,
      providerCode: this.providerCode, providerMessage: this.providerMessage, body: this.body };
  }
}

function tournamentMatches(tournament, target) {
  const name = `${tournament.tournamentName ?? ''} ${tournament.tournamentSlug ?? ''}`;
  const category = `${tournament.categoryName ?? ''} ${tournament.categorySlug ?? ''}`;
  return target.match.test(name) && (!target.country || compact(category).includes(compact(target.country)) || target.label === 'Copa Libertadores');
}

function mexicoCandidateScore(tournament) {
  const name = compact(tournament.tournamentName);
  const slug = compact(tournament.tournamentSlug);
  const category = `${compact(tournament.categoryName)} ${compact(tournament.categorySlug)}`;
  if (!category.includes('mexico')) return 0;
  if (name.includes('ligamx') || slug.includes('ligamx')) return 100;
  if (name.includes('primeradivision') || slug.includes('primeradivision')) return 60;
  return 0;
}

function identifyFootballTournaments(tournaments) {
  const brazilTargets = FOOTBALL_TOURNAMENTS.filter(target => target.country !== 'Mexico');
  const brazil = brazilTargets.flatMap(target => tournaments.filter(t => tournamentMatches(t, target)).slice(0, 1));
  const mexicoCandidates = tournaments.map(tournament => ({ tournament, score: mexicoCandidateScore(tournament) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score
      || Number(b.tournament.futureFixtures ?? b.tournament.upcomingFixtures ?? 0) - Number(a.tournament.futureFixtures ?? a.tournament.upcomingFixtures ?? 0));
  return {
    brazil: [...new Map(brazil.map(t => [String(t.tournamentId), t])).values()],
    mexico: mexicoCandidates[0]?.tournament ?? null,
    mexicoCandidates: mexicoCandidates.map(({ tournament, score }) => ({ ...tournament, confidenceScore: score })),
  };
}

function canonicalMarket(definition) {
  const name = String(definition?.marketName ?? definition?.marketNameShort ?? '').toLowerCase();
  const type = String(definition?.marketType ?? '').toLowerCase();
  const period = String(definition?.period ?? '').toLowerCase();
  if ((type === '1x2' || /full time result|regular time result|\b1x2\b/.test(name)) && /full|regular|result/.test(`${period} ${name}`)) return 'MATCH_WINNER';
  if (/both teams.*score|\bbtts\b/.test(name)) return 'BTTS';
  if (/double chance/.test(name) || type === 'double_chance') return 'DOUBLE_CHANCE';
  if ((type === 'totals' || /over.*under|total/.test(name)) && /full|regular|result/.test(`${period} ${name}`)) return 'TOTAL_GOALS';
  return null;
}

function canonicalOutcome(name, market) {
  const value = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (market === 'MATCH_WINNER') return ({ '1': 'HOME', x: 'DRAW', '2': 'AWAY', home: 'HOME', draw: 'DRAW', away: 'AWAY' })[value] ?? null;
  if (market === 'TOTAL_GOALS') return value.startsWith('over') ? 'OVER' : value.startsWith('under') ? 'UNDER' : null;
  if (market === 'BTTS') return value === 'yes' ? 'YES' : value === 'no' ? 'NO' : null;
  if (market === 'DOUBLE_CHANCE') {
    return ({ '1x': 'HOME_OR_DRAW', '12': 'HOME_OR_AWAY', x2: 'DRAW_OR_AWAY',
      'home or draw': 'HOME_OR_DRAW', 'home or away': 'HOME_OR_AWAY', 'draw or away': 'DRAW_OR_AWAY' })[value] ?? null;
  }
  return null;
}

function findBookmakerKey(bookmakerOdds, desired) {
  return Object.keys(bookmakerOdds ?? {}).find(key => compact(key) === compact(desired)) ?? null;
}

function balancedTournamentSample(fixtures, tournamentIds, limit) {
  const groups = new Map(tournamentIds.map(id => [String(id), []]));
  for (const fixture of fixtures) groups.get(String(fixture.tournamentId))?.push(fixture);
  const selected = [];
  while (selected.length < limit && [...groups.values()].some(group => group.length)) {
    for (const group of groups.values()) {
      const fixture = group.shift();
      if (fixture) selected.push(fixture);
      if (selected.length === limit) break;
    }
  }
  return selected;
}

export class OddsPapiAdapter extends ProviderAdapter {
  constructor({ apiKey, baseUrl = 'https://api.oddspapi.io/v4', fetchImpl = fetch, maxBillableRequests = 10, cooldownMs = 2100 } = {}) {
    super();
    if (!apiKey || /replace|your[_ -]?token|^https?:\/\//i.test(apiKey)) throw new Error('ODDSPAPI_API_KEY must contain a real token supplied through the process environment.');
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.maxBillableRequests = maxBillableRequests;
    this.cooldownMs = cooldownMs;
    this.billableRequests = 0;
    this.totalHttpRequests = 0;
    this.cache = new Map();
    this.lastRequestAt = 0;
    this.stages = [];
  }

  async request(path, params = {}, { billable = true, cache = true } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    const cacheKey = url.toString().replace(/([?&]apiKey=)[^&]+/, '$1[redacted]');
    if (cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    if (billable && this.billableRequests >= this.maxBillableRequests) throw new Error(`OddsPapi validation request budget exhausted (${this.maxBillableRequests}).`);
    const wait = this.cooldownMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await sleep(wait);
    url.searchParams.set('apiKey', this.apiKey);
    this.totalHttpRequests++;
    if (billable) this.billableRequests++;
    const response = await this.fetch(url, { headers: { Accept: 'application/json' } });
    this.lastRequestAt = Date.now();
    const rawText = await response.text();
    let body;
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = { raw: rawText }; }
    if (!response.ok) {
      const safeQuery = sanitize(Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'apiKey')), this.apiKey);
      const safeBody = sanitize(body, this.apiKey);
      const provider = providerErrorParts(safeBody);
      const error = new OddsPapiHttpError({ status: response.status, method: 'GET', path: url.pathname,
        query: safeQuery, body: safeBody, providerCode: provider.code, providerMessage: provider.message });
      console.error(`OddsPapi non-2xx response:\n${JSON.stringify(error.toJSON(), null, 2)}`);
      throw error;
    }
    if (cache) this.cache.set(cacheKey, body);
    return body;
  }

  async account({ fresh = false } = {}) { return this.request('/account', {}, { billable: false, cache: !fresh }); }

  async runStage(name, action, request = null, { emptyErrorCodes = [] } = {}) {
    const stage = { name, status: 'IN_PROGRESS', request, startedAt: new Date().toISOString() };
    this.stages.push(stage);
    try {
      const value = await action();
      stage.status = 'PASS';
      stage.completedAt = new Date().toISOString();
      stage.resultCount = asArray(value).length;
      return value;
    } catch (error) {
      if (error instanceof OddsPapiHttpError && emptyErrorCodes.includes(error.providerCode)) {
        stage.status = 'SKIPPED';
        stage.completedAt = new Date().toISOString();
        stage.resultCount = 0;
        stage.emptyReason = { providerCode: error.providerCode, providerMessage: error.providerMessage };
        return [];
      }
      stage.status = 'FAIL';
      stage.completedAt = new Date().toISOString();
      stage.error = error instanceof OddsPapiHttpError ? error.toJSON() : { message: error.message };
      throw error;
    }
  }

  normalizeOdds(fixtures, marketDefinitions, desiredBookmakers = DEFAULT_BOOKMAKERS) {
    const definitions = new Map(asArray(marketDefinitions).map(m => [String(m.marketId), m]));
    const normalizedFixtures = [];
    const normalizedOdds = [];
    const diagnostics = [];
    for (const fixture of asArray(fixtures)) {
      normalizedFixtures.push({
        fixtureId: String(fixture.fixtureId), league: fixture.tournamentName ?? null, sport: fixture.sportName ?? null,
        country: fixture.categoryName ?? null, homeTeam: fixture.participant1Name ?? null,
        awayTeam: fixture.participant2Name ?? null, kickoff: fixture.startTime ?? null,
        providerUpdatedAt: fixture.updatedAt ?? null,
      });
      for (const desired of desiredBookmakers) {
        const bookmakerKey = findBookmakerKey(fixture.bookmakerOdds, desired);
        if (!bookmakerKey) continue;
        const bookmaker = fixture.bookmakerOdds[bookmakerKey];
        for (const [marketId, offeredMarket] of Object.entries(bookmaker.markets ?? {})) {
          const definition = definitions.get(String(marketId));
          const market = canonicalMarket(definition);
          if (!market || definition?.playerProp) continue;
          const line = definition?.handicap ?? null;
          if (market === 'TOTAL_GOALS' && Number(line) !== 2.5) continue;
          for (const [outcomeId, offeredOutcome] of Object.entries(offeredMarket.outcomes ?? {})) {
            const outcomeDefinition = definition?.outcomes?.find(o => String(o.outcomeId) === String(outcomeId));
            const outcome = canonicalOutcome(outcomeDefinition?.outcomeName, market);
            if (!outcome) {
              diagnostics.push(`Unmapped outcome ${outcomeId} in market ${marketId} for fixture ${fixture.fixtureId}`);
              continue;
            }
            for (const price of Object.values(offeredOutcome.players ?? {})) {
              const decimalOdds = Number(price.price);
              if (!Number.isFinite(decimalOdds) || price.active === false || offeredMarket.marketActive === false) continue;
              normalizedOdds.push({
                fixtureId: String(fixture.fixtureId), league: fixture.tournamentName ?? null,
                sport: fixture.sportName ?? null, homeTeam: fixture.participant1Name ?? null,
                awayTeam: fixture.participant2Name ?? null, kickoff: fixture.startTime ?? null,
                bookmaker: bookmakerKey, market, outcome, line: market === 'TOTAL_GOALS' ? Number(line) : null,
                decimalOdds, providerUpdatedAt: price.bookmakerChangedAt ?? price.changedAt ?? fixture.updatedAt ?? null,
              });
            }
          }
        }
      }
    }
    return { fixtures: normalizedFixtures, odds: normalizedOdds, diagnostics };
  }

  async collectValidationSample({ maxFootballFixtures = 20, basketballFixtureLimit = 0, bookmakers = DEFAULT_BOOKMAKERS, diagnosticOnly = false } = {}) {
    const before = await this.runStage('account/auth connectivity', () => this.account({ fresh: true }), { path: '/v4/account', query: {} });
    this.accountBefore = before;
    const beforeSub = activeSubscription(before);
    const soccerId = beforeSub?.sport_ids?.includes(10) ? 10 : 10;
    const soccerTournaments = asArray(await this.runStage('soccer tournaments',
      () => this.request('/tournaments', { sportId: soccerId, language: 'en' }),
      { path: '/v4/tournaments', query: { sportId: soccerId, language: 'en' } }));
    const identification = identifyFootballTournaments(soccerTournaments);
    const uniqueFootball = [...identification.brazil, ...(identification.mexico ? [identification.mexico] : [])];
    const validationFootball = diagnosticOnly ? uniqueFootball.slice(0, 1) : uniqueFootball;
    const fixturesByTournament = [];
    const fixtureCountsByTournament = [];
    for (const tournament of validationFootball) {
      const params = { tournamentId: tournament.tournamentId, statusId: 0, hasOdds: true, bookmakers: bookmakers.join(','), language: 'en' };
      const fixtures = asArray(await this.runStage(`pregame fixtures: ${tournament.tournamentName}`,
        () => this.request('/fixtures', params), { path: '/v4/fixtures', query: params }, { emptyErrorCodes: ['FIXTURE_NOT_FOUND'] }));
      fixturesByTournament.push(...fixtures);
      fixtureCountsByTournament.push({ tournamentId: tournament.tournamentId, tournamentName: tournament.tournamentName,
        categoryName: tournament.categoryName, fixturesFound: fixtures.length, status: fixtures.length ? 'SAMPLED' : 'NO SAMPLE' });
    }
    const eligibleFootball = fixturesByTournament.filter(f => Number(f.statusId) === 0 || /pre.?game|not.*started/i.test(f.statusName ?? ''))
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    const upcomingFootball = balancedTournamentSample(eligibleFootball, validationFootball.map(t => t.tournamentId), diagnosticOnly ? 1 : maxFootballFixtures);
    const markets = asArray(await this.runStage('market catalog', () => this.request('/markets', { language: 'en' }),
      { path: '/v4/markets', query: { language: 'en' } }));
    const fixtureIds = new Set(upcomingFootball.map(f => String(f.fixtureId)));
    const footballOdds = [];
    const bookmakerResponses = [];
    const sampledTournamentIds = validationFootball.filter(t => upcomingFootball.some(f => String(f.tournamentId) === String(t.tournamentId)))
      .map(t => t.tournamentId);
    for (const bookmaker of bookmakers) {
      if (!sampledTournamentIds.length) {
        bookmakerResponses.push({ bookmaker, fixturesReturned: 0, sampledFixturesReturned: 0, status: 'NO SAMPLE' });
        continue;
      }
      const params = { tournamentIds: sampledTournamentIds.join(','), bookmaker, language: 'en', verbosity: 3, oddsFormat: 'decimal' };
      const bookmakerOdds = asArray(await this.runStage(`pregame bookmaker odds: ${bookmaker}`,
        () => this.request('/odds-by-tournaments', params), { path: '/v4/odds-by-tournaments', query: params }));
      const sampled = bookmakerOdds.filter(f => fixtureIds.has(String(f.fixtureId)));
      footballOdds.push(...sampled);
      bookmakerResponses.push({ bookmaker, fixturesReturned: bookmakerOdds.length, sampledFixturesReturned: sampled.length,
        status: sampled.length ? 'SAMPLED' : 'NO SAMPLE' });
    }
    const football = this.normalizeOdds(footballOdds, markets, bookmakers);
    // Preserve the independently validated fixture stage even if a bookmaker has no odds object.
    football.fixtures = upcomingFootball.map(f => ({ fixtureId: String(f.fixtureId), league: f.tournamentName ?? null,
      sport: f.sportName ?? 'Soccer', country: f.categoryName ?? null, homeTeam: f.participant1Name ?? null,
      awayTeam: f.participant2Name ?? null, kickoff: f.startTime ?? null, providerUpdatedAt: f.updatedAt ?? null }));

    let basketballNormalized = { fixtures: [], odds: [], diagnostics: [] };
    let basketballTournament = null;
    if (!diagnosticOnly && basketballFixtureLimit > 0 && beforeSub?.sport_ids?.includes(11)) {
      const basketballTournaments = asArray(await this.runStage('basketball tournaments',
        () => this.request('/tournaments', { sportId: 11, language: 'en' }), { path: '/v4/tournaments', query: { sportId: 11, language: 'en' } }));
      basketballTournament = basketballTournaments.find(t => /nba/i.test(t.tournamentName ?? ''))
        ?? basketballTournaments.find(t => Number(t.futureFixtures ?? t.upcomingFixtures ?? 0) > 0)
        ?? basketballTournaments[0];
      if (basketballTournament) {
        const fixtureParams = { tournamentId: basketballTournament.tournamentId, statusId: 0, hasOdds: true,
          bookmakers: bookmakers.join(','), language: 'en' };
        const basketballFixtures = asArray(await this.runStage(`basketball pregame fixtures: ${basketballTournament.tournamentName}`,
          () => this.request('/fixtures', fixtureParams), { path: '/v4/fixtures', query: fixtureParams }))
          .slice(0, basketballFixtureLimit);
        const basketballIds = new Set(basketballFixtures.map(f => String(f.fixtureId)));
        const basketballOdds = [];
        for (const bookmaker of bookmakers) {
          const oddsParams = { tournamentIds: String(basketballTournament.tournamentId), bookmaker,
            language: 'en', verbosity: 3, oddsFormat: 'decimal' };
          const returned = asArray(await this.runStage(`basketball pregame odds: ${bookmaker}`,
            () => this.request('/odds-by-tournaments', oddsParams), { path: '/v4/odds-by-tournaments', query: oddsParams }));
          basketballOdds.push(...returned.filter(f => basketballIds.has(String(f.fixtureId))));
        }
        basketballNormalized = this.normalizeOdds(basketballOdds, markets, bookmakers);
        basketballNormalized.fixtures = basketballFixtures.map(f => ({ fixtureId: String(f.fixtureId), league: f.tournamentName ?? null,
          sport: f.sportName ?? 'Basketball', country: f.categoryName ?? null, homeTeam: f.participant1Name ?? null,
          awayTeam: f.participant2Name ?? null, kickoff: f.startTime ?? null, providerUpdatedAt: f.updatedAt ?? null }));
      }
    }
    const after = await this.account({ fresh: true });
    this.accountAfter = after;
    const afterSub = activeSubscription(after);
    return {
      provider: 'oddspapi', account: {
        requestLimit: afterSub?.request_limit ?? beforeSub?.request_limit ?? null,
        requestCountBefore: beforeSub?.request_count ?? null,
        requestCountAfter: afterSub?.request_count ?? null,
        sports: (afterSub?.sport_ids ?? beforeSub?.sport_ids ?? []).map(id => ({ id, name: id === 10 ? 'Soccer' : id === 11 ? 'Basketball' : `Sport ${id}` })),
        bookmakers: afterSub?.bookmakers ?? beforeSub?.bookmakers ?? {},
      },
      requests: {
        adapterBillableRequests: this.billableRequests, totalHttpRequests: this.totalHttpRequests,
        measuredAccountDelta: Number.isFinite(afterSub?.request_count - beforeSub?.request_count) ? afterSub.request_count - beforeSub.request_count : null,
      },
      runMode: diagnosticOnly ? 'DIAGNOSTIC' : 'FULL',
      football: { ...football, tournamentsAvailable: soccerTournaments, tournamentsSelected: validationFootball,
        tournamentIdentification: { brazil: identification.brazil, mexico: identification.mexico,
          mexicoCandidates: identification.mexicoCandidates }, fixtureCountsByTournament, bookmakerResponses },
      basketball: { ...basketballNormalized, tournamentSelected: basketballTournament ?? null },
      validationStages: this.stages,
    };
  }
}

export const OddsPapiConstants = { DEFAULT_BOOKMAKERS, FOOTBALL_TOURNAMENTS };
