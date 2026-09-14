import { SafeProviderError, sanitizeQuery, sanitizeText } from '@/providers/safe-error';
import type {
  SportmonksFixturePayload, SportmonksGateway, SportmonksLeaguePayload, SportmonksSeasonPayload, SportmonksTeamPayload,
  SportmonksStandingPayload,
} from './types';

interface SportmonksEnvelope<T> {
  data: T;
  message?: string;
  error?: string;
  pagination?: { has_more?: boolean; current_page?: number; last_page?: number };
}

export class HttpSportmonksGateway implements SportmonksGateway {
  private requests = 0;
  private competitionCatalog: Promise<SportmonksLeaguePayload[]> | null = null;
  private readonly searchCache = new Map<string, Promise<SportmonksLeaguePayload[]>>();
  private readonly fixtureCache = new Map<string, Promise<SportmonksFixturePayload[]>>();
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.sportmonks.com/v3',
    private readonly scoreDetails?: (rows: SportmonksFixturePayload[]) => Promise<void>) {
    if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required on the server');
  }

  private async requestEnvelope<T>(path: string, query: Record<string, string> = {}): Promise<SportmonksEnvelope<T>> {
    const url = new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
    this.requests++;
    const response = await fetch(url, { headers: { Authorization: this.apiKey, Accept: 'application/json' }, cache: 'no-store', signal:AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => ({})) as SportmonksEnvelope<T>;
    if (!response.ok) throw new SafeProviderError({ provider: 'SPORTMONKS', status: response.status, endpoint: url.pathname,
      query: sanitizeQuery(url.searchParams), code: null,
      message: sanitizeText(body.message ?? body.error ?? 'Provider request failed', [this.apiKey]) });
    return body;
  }

  private async request<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return (await this.requestEnvelope<T>(path, query)).data;
  }

  private async paged<T>(path: string, query: Record<string, string> = {}, maxPages = 20): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const envelope = await this.requestEnvelope<T[]>(path, { ...query, page: String(page), per_page: '50' });
      rows.push(...envelope.data);
      if (!envelope.pagination?.has_more) break;
    }
    return rows;
  }

  async competitions(countryCodes?: readonly string[]): Promise<SportmonksLeaguePayload[]> {
    this.competitionCatalog ??= this.paged<SportmonksLeaguePayload>('football/leagues', { include: 'country;seasons' });
    const rows = await this.competitionCatalog;
    if (!countryCodes?.length) return rows;
    const wanted = new Set(countryCodes.map(code => code.toLowerCase()));
    return rows.filter(row => wanted.has(row.country?.iso2?.toLowerCase() ?? '') || wanted.has(row.country?.name?.toLowerCase() ?? ''));
  }

  searchCompetitions(query: string) {
    const key = query.trim().toLowerCase();
    if (!this.searchCache.has(key)) this.searchCache.set(key,
      this.paged<SportmonksLeaguePayload>(`football/leagues/search/${encodeURIComponent(query)}`, { include: 'country;seasons' }, 3));
    return this.searchCache.get(key)!;
  }

  seasons(providerCompetitionId: string) {
    return this.paged<SportmonksSeasonPayload>('football/seasons', { filters: `seasonLeagues:${providerCompetitionId}` });
  }

  teams(providerSeasonId: string) { return this.paged<SportmonksTeamPayload>(`football/teams/seasons/${providerSeasonId}`, { include: 'country' }); }

  fixtures(from: Date, to: Date, providerCompetitionIds?: readonly string[]) {
    const ids = providerCompetitionIds?.length ? [...providerCompetitionIds].sort().join(',') : '';
    const path = `football/fixtures/between/${from.toISOString().slice(0, 10)}/${to.toISOString().slice(0, 10)}`;
    const key = `${path}|${ids}`;
    if (!this.fixtureCache.has(key)) this.fixtureCache.set(key, this.paged<SportmonksFixturePayload>(path, {
      include: 'participants;state;scores', filters: ids ? `fixtureLeagues:${ids}` : '',
    }));
    return this.fixtureCache.get(key)!;
  }

  fixture(providerFixtureId: string) {
    return this.request<SportmonksFixturePayload>(`football/fixtures/${providerFixtureId}`, { include: 'participants;state;scores' })
      .catch(error => { if (error instanceof SafeProviderError && error.context.status === 404) return null; throw error; });
  }

  fixtureDetails(providerFixtureId: string) {
    return this.request<SportmonksFixturePayload>(`football/fixtures/${providerFixtureId}`, {
      include: 'participants;state;scores;season;league;round;stage;group;venue;events.type;statistics.type;lineups;formations;coaches',
    }).catch(error => { if (error instanceof SafeProviderError && error.context.status === 404) return null; throw error; });
  }

  async scores(providerFixtureIds: readonly string[]) {
    if (!providerFixtureIds.length) return [];
    // Sports detail updates reuse this same accounted HTTP request. Ordinary gateway users keep the small score payload.
    const include = this.scoreDetails
      ? 'participants;state;scores;round;stage;group;venue;events.type;statistics.type;lineups.details.type;formations;coaches'
      : 'participants;state;scores';
    const rows = await this.request<SportmonksFixturePayload[]>(`football/fixtures/multi/${providerFixtureIds.join(',')}`, { include });
    if (this.scoreDetails) await this.scoreDetails(rows);
    return rows;
  }

  async events(providerFixtureId: string) {
    const value = await this.request<{ events?: unknown[] }>(`football/fixtures/${providerFixtureId}`, { include: 'events' });
    return value.events ?? [];
  }

  standings(providerSeasonId: string) {
    return this.request<SportmonksStandingPayload[]>(`football/standings/seasons/${providerSeasonId}`, { include: 'participant;details.type;stage;group' });
  }

  async lineups(providerFixtureId: string) {
    const value = await this.request<{ lineups?: unknown[] }>(`football/fixtures/${providerFixtureId}`, { include: 'lineups' });
    return value.lineups ?? [];
  }

  async statistics(providerFixtureId: string) {
    const value = await this.request<{ statistics?: unknown[] }>(`football/fixtures/${providerFixtureId}`, { include: 'statistics' });
    return value.statistics ?? [];
  }

  headToHead(providerHomeTeamId: string, providerAwayTeamId: string) {
    return this.request<SportmonksFixturePayload[]>(`football/fixtures/head-to-head/${providerHomeTeamId}/${providerAwayTeamId}`, { include: 'participants;state' });
  }


  requestCount(): number { return this.requests; }
}
