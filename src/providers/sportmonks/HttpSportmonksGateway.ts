import 'server-only';
import { SafeProviderError, sanitizeQuery, sanitizeText } from '@/providers/safe-error';
import type {
  SportmonksFixturePayload, SportmonksGateway, SportmonksLeaguePayload, SportmonksSeasonPayload, SportmonksTeamPayload,
} from './types';

interface SportmonksEnvelope<T> {
  data: T;
  message?: string;
  error?: string;
  pagination?: { has_more?: boolean; current_page?: number; last_page?: number };
}

export class HttpSportmonksGateway implements SportmonksGateway {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.sportmonks.com/v3') {
    if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required on the server');
  }

  private async requestEnvelope<T>(path: string, query: Record<string, string> = {}): Promise<SportmonksEnvelope<T>> {
    const url = new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { Authorization: this.apiKey, Accept: 'application/json' }, cache: 'no-store' });
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
    const rows = await this.paged<SportmonksLeaguePayload>('football/leagues', { include: 'country' });
    if (!countryCodes?.length) return rows;
    const wanted = new Set(countryCodes.map(code => code.toLowerCase()));
    return rows.filter(row => wanted.has(row.country?.iso2?.toLowerCase() ?? '') || wanted.has(row.country?.name?.toLowerCase() ?? ''));
  }

  seasons(providerCompetitionId: string) {
    return this.paged<SportmonksSeasonPayload>('football/seasons', { filters: `seasonLeagues:${providerCompetitionId}` });
  }

  teams(providerSeasonId: string) { return this.paged<SportmonksTeamPayload>(`football/teams/seasons/${providerSeasonId}`); }

  fixtures(from: Date, to: Date, providerCompetitionIds?: readonly string[]) {
    return this.paged<SportmonksFixturePayload>(`football/fixtures/between/${from.toISOString().slice(0, 10)}/${to.toISOString().slice(0, 10)}`, {
      include: 'participants;state;scores', filters: providerCompetitionIds?.length ? `fixtureLeagues:${providerCompetitionIds.join(',')}` : '',
    });
  }

  fixture(providerFixtureId: string) {
    return this.request<SportmonksFixturePayload>(`football/fixtures/${providerFixtureId}`, { include: 'participants;state;scores' })
      .catch(error => { if (error instanceof SafeProviderError && error.context.status === 404) return null; throw error; });
  }

  scores(providerFixtureIds: readonly string[]) {
    return providerFixtureIds.length
      ? this.request<SportmonksFixturePayload[]>(`football/fixtures/multi/${providerFixtureIds.join(',')}`, { include: 'participants;state;scores' })
      : Promise.resolve([]);
  }

  async events(providerFixtureId: string) {
    const value = await this.request<{ events?: unknown[] }>(`football/fixtures/${providerFixtureId}`, { include: 'events' });
    return value.events ?? [];
  }

  standings(providerSeasonId: string) { return this.request<unknown[]>(`football/standings/seasons/${providerSeasonId}`); }

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
}
