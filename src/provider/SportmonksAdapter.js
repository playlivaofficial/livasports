import { ProviderAdapter } from './ProviderAdapter.js';

const TARGET_COUNTRIES = new Set(['brazil', 'mexico']);

const MARKET_RULES = [
  { canonical: 'MATCH_WINNER', market: /(?:fulltime|full time|3way|3 way|match)\s*(?:result|winner)|^1x2$/i },
  { canonical: 'TOTAL_GOALS', market: /(?:over\/?under|total goals|goals over\/under)/i },
  { canonical: 'BTTS', market: /both teams.*score|btts/i },
  { canonical: 'DOUBLE_CHANCE', market: /double chance|double change/i },
];

function ymd(date) { return date.toISOString().slice(0, 10); }
function countryName(fixture) {
  return fixture?.league?.country?.name ?? fixture?.league?.country?.official_name ?? '';
}
function balancedCountrySample(fixtures, limit) {
  const groups = new Map([...TARGET_COUNTRIES].map(country => [country, []]));
  for (const fixture of fixtures) groups.get(countryName(fixture).toLowerCase())?.push(fixture);
  const sample = [];
  while (sample.length < limit && [...groups.values()].some(items => items.length)) {
    for (const country of TARGET_COUNTRIES) {
      const next = groups.get(country)?.shift();
      if (next) sample.push(next);
      if (sample.length === limit) break;
    }
  }
  return sample;
}
function participantNames(fixture) {
  const ps = fixture.participants ?? [];
  const home = ps.find(p => p.meta?.location === 'home') ?? ps[0];
  const away = ps.find(p => p.meta?.location === 'away') ?? ps[1];
  return { home: home?.name ?? null, away: away?.name ?? null };
}
function marketName(odd) { return odd.market?.name ?? odd.market?.developer_name ?? odd.market_description ?? ''; }
function canonicalMarket(odd) {
  const name = marketName(odd);
  return MARKET_RULES.find(r => r.market.test(name))?.canonical ?? null;
}
function parseTotalLine(odd) {
  if (canonicalMarket(odd) !== 'TOTAL_GOALS') return odd.total ?? odd.handicap ?? null;
  const text = [odd.label, odd.name, odd.market_description].filter(Boolean).join(' ');
  const match = text.match(/(?:over|under|o|u)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return odd.total ?? odd.handicap ?? (match ? Number(match[1]) : null);
}
function canonicalOutcome(odd, market) {
  const raw = String(odd.label ?? odd.name ?? '').trim();
  const s = raw.toLowerCase().replace(/\s+/g, ' ');
  if (market === 'MATCH_WINNER') {
    if (/^(1|home|home win)$/.test(s)) return 'HOME';
    if (/^(x|draw)$/.test(s)) return 'DRAW';
    if (/^(2|away|away win)$/.test(s)) return 'AWAY';
  }
  if (market === 'TOTAL_GOALS') {
    if (/over|^o\s?\d/.test(s)) return 'OVER';
    if (/under|^u\s?\d/.test(s)) return 'UNDER';
  }
  if (market === 'BTTS') {
    if (/^(yes|y)$/.test(s)) return 'YES';
    if (/^(no|n)$/.test(s)) return 'NO';
  }
  if (market === 'DOUBLE_CHANCE') {
    if (/^(1x|home.*draw|draw.*home)$/.test(s)) return 'HOME_OR_DRAW';
    if (/^(12|home.*away|away.*home)$/.test(s)) return 'HOME_OR_AWAY';
    if (/^(x2|draw.*away|away.*draw)$/.test(s)) return 'DRAW_OR_AWAY';
  }
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'UNKNOWN';
}

export class SportmonksAdapter extends ProviderAdapter {
  constructor({ apiKey, baseUrl = 'https://api.sportmonks.com/v3', fetchImpl = fetch }) {
    super();
    if (!apiKey || /YOUR_TOKEN|replace_with_real_token|api\.sportmonks\.com|^https?:\/\//i.test(apiKey)) {
      throw new Error('SPORTMONKS_API_KEY must contain a real token only (not the example URL or YOUR_TOKEN).');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async request(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value));
    const response = await this.fetch(url, { headers: { Authorization: this.apiKey, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Sportmonks ${response.status}: ${body.message ?? body.error ?? 'request failed'}`);
    return body;
  }

  async paged(path, params, { maxPages = 20 } = {}) {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const body = await this.request(path, { ...params, page, per_page: 50 });
      all.push(...(Array.isArray(body.data) ? body.data : [body.data].filter(Boolean)));
      if (!body.pagination?.has_more) break;
    }
    return all;
  }

  async collectValidationSample({ startDate = new Date(), daysAhead = 90, maxFixtures = 60 } = {}) {
    const end = new Date(startDate);
    end.setUTCDate(end.getUTCDate() + daysAhead);
    const diagnostics = [];
    const raw = await this.paged(`/football/fixtures/between/${ymd(startDate)}/${ymd(end)}`, {
      include: 'league.country;participants;odds.market;odds.bookmaker',
      order: 'asc',
    }, { maxPages: 50 });
    const eligible = raw.filter(f => TARGET_COUNTRIES.has(countryName(f).toLowerCase()) && f.has_odds !== false);
    const fixtures = balancedCountrySample(eligible, maxFixtures);
    const normalizedFixtures = [];
    const normalizedOdds = [];
    for (const fixture of fixtures) {
      const teams = participantNames(fixture);
      const geo = countryName(fixture);
      normalizedFixtures.push({
        fixtureId: String(fixture.id), competition: fixture.league?.name ?? null, country: geo,
        homeTeam: teams.home, awayTeam: teams.away, kickoffTime: fixture.starting_at ?? null,
        providerUpdatedAt: fixture.last_processed_at ?? fixture.updated_at ?? null,
      });
      for (const odd of fixture.odds ?? []) {
        const market = canonicalMarket(odd);
        if (!market) continue;
        const line = parseTotalLine(odd);
        if (market === 'TOTAL_GOALS' && Number(line) !== 2.5) continue;
        const decimalOdds = Number(odd.value ?? odd.odds ?? odd.decimal);
        if (!Number.isFinite(decimalOdds)) {
          diagnostics.push(`Non-decimal/unparseable odds skipped for fixture ${fixture.id}, odd ${odd.id ?? 'unknown'}`);
          continue;
        }
        normalizedOdds.push({
          fixtureId: String(fixture.id), competition: fixture.league?.name ?? null, country: geo,
          homeTeam: teams.home, awayTeam: teams.away, kickoffTime: fixture.starting_at ?? null,
          bookmaker: odd.bookmaker?.name ?? `UNKNOWN_BOOKMAKER_${odd.bookmaker_id ?? 'NA'}`,
          market, outcome: canonicalOutcome(odd, market), line, decimalOdds,
          providerUpdatedAt: odd.latest_bookmaker_update ?? odd.updated_at ?? odd.last_updated_at ?? fixture.last_processed_at ?? null,
        });
      }
    }
    return { provider: 'sportmonks', fixtures: normalizedFixtures, odds: normalizedOdds, diagnostics };
  }
}
