import type { Cache, CacheResultStatus } from '@/cache/cache';
import { cacheKeys, routeCacheTags } from '@/cache/keys';
import { DEFAULT_CACHE_TTLS, type CacheTtlPolicy } from '@/cache/ttl-policy';
import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import { localDateKey } from './time';
import type { M2PageData } from './types';
import { unavailableDatabasePage } from './DatabaseM2ReadService';

export interface RouteDatabaseReader { loadOrThrow(locale: SiteLocale, page: PageKey): Promise<M2PageData>; }

export interface RouteLoadMetric {
  event: 'route-data-load'; locale: SiteLocale; page: PageKey; durationMs: number; cache: CacheResultStatus | 'ERROR'; providerRequests: 0;
  error?: { name: string; message: string };
}

function ttl(page: PageKey, policy: CacheTtlPolicy): number {
  if (page === 'live') return policy.routeLive;
  if (page === 'football') return policy.routeFootball;
  if (page === 'today') return policy.routeToday;
  return policy.routeHome;
}

function staleData(data: M2PageData): M2PageData {
  return { ...data, sportsData: { state: 'partial', freshness: 'stale', reason: 'provider-error' },
    sections: data.sections.map(section => ({ ...section, fixtures: section.fixtures.map(fixture => ({ ...fixture, freshness: 'stale' })) })) };
}

export class M3RouteDataLoader {
  constructor(
    private readonly database: RouteDatabaseReader,
    private readonly cache: Cache,
    private readonly policy: CacheTtlPolicy = DEFAULT_CACHE_TTLS,
    private readonly now: () => Date = () => new Date(),
    private readonly onMetric: (metric: RouteLoadMetric) => void = () => undefined,
  ) {}

  async load(locale: SiteLocale, page: PageKey): Promise<M2PageData> {
    const started = performance.now();
    const now = this.now();
    const key = cacheKeys.routeData(locale, page, localDateKey(now, getDictionary(locale).timeZone));
    try {
      const result = await this.cache.getOrSet(key, {
        ttlSeconds: ttl(page, this.policy), staleIfErrorSeconds: page === 'live' ? 120 : 24 * 60 * 60,
        tags: routeCacheTags(locale, page),
      }, () => this.database.loadOrThrow(locale, page));
      this.onMetric({ event: 'route-data-load', locale, page, durationMs: Math.round((performance.now() - started) * 10) / 10,
        cache: result.status, providerRequests: 0 });
      return result.status === 'STALE' ? staleData(result.value) : result.value;
    } catch (error) {
      const safeError = error instanceof Error
        ? { name: error.name, message: error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_DATABASE_URL]') }
        : { name: 'Error', message: 'Route data cache failed' };
      this.onMetric({ event: 'route-data-load', locale, page, durationMs: Math.round((performance.now() - started) * 10) / 10,
        cache: 'ERROR', providerRequests: 0, error: safeError });
      return unavailableDatabasePage(locale, page, now);
    }
  }
}
