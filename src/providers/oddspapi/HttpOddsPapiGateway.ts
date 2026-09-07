import 'server-only';
import type { CacheCoordinator } from '@/cache/cache';
import type { ProviderRequestBudget } from '@/providers/request-budget';
import { SafeProviderError, sanitizeQuery, sanitizeText } from '@/providers/safe-error';
import type { OddsPapiFixtureOdds, OddsPapiGateway, OddsPapiMarketDefinition } from './types';
import { buildOddsByTournamentQuery } from './request-shape';

export class HttpOddsPapiGateway implements OddsPapiGateway {
  private requests = 0;

  constructor(
    private readonly apiKey: string,
    private readonly cache: CacheCoordinator,
    private readonly budget: ProviderRequestBudget,
    private readonly baseUrl = 'https://api.oddspapi.io/v4',
    private readonly oddsTtlSeconds = 300,
    private readonly onDiagnostic: (event: Readonly<Record<string, unknown>>) => void = () => undefined,
  ) {
    if (!apiKey) throw new Error('ODDSPAPI_API_KEY is required on the server');
  }

  requestCount() { return this.requests; }

  private async request<T>(path: string, query: Record<string, string>, ttlSeconds: number): Promise<T> {
    const cacheKey = `oddspapi:${path}:${new URLSearchParams(query).toString()}`;
    const result = await this.cache.getOrSet(cacheKey, { ttlSeconds }, async () => {
      const budget = this.budget.consume();
      this.requests++;
      this.onDiagnostic({ event: 'oddspapi-request', endpoint: path, requestCount: this.requests,
        budget: { used: budget.used, remaining: budget.remaining, limit: budget.limit, period: budget.period } });
      const url = new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      url.searchParams.set('apiKey', this.apiKey);
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const body = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string }; message?: string };
      if (!response.ok) throw new SafeProviderError({ provider: 'ODDSPAPI', status: response.status, endpoint: url.pathname,
        query: sanitizeQuery(url.searchParams), code: body.error?.code ?? null,
        message: sanitizeText(body.error?.message ?? body.message ?? 'Provider request failed', [this.apiKey]) });
      return body;
    });
    this.onDiagnostic({ event: 'oddspapi-cache', endpoint: path, status: result.status });
    return result.value;
  }

  bookmakers() { return this.request<Array<{ bookmakerName: string; slug: string; liveOdds: boolean | null }>>('bookmakers', {}, 24 * 60 * 60); }
  markets() { return this.request<OddsPapiMarketDefinition[]>('markets', { language: 'en' }, 24 * 60 * 60); }

  oddsByTournaments(tournamentIds: readonly string[], bookmaker: string) {
    if (!tournamentIds.length) return Promise.resolve([]);
    // OddsPapi v4 accepts exactly one singular bookmaker per request.
    return this.request<OddsPapiFixtureOdds[]>('odds-by-tournaments', buildOddsByTournamentQuery(tournamentIds, bookmaker), this.oddsTtlSeconds);
  }
}
