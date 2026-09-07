import { describe, expect, it } from 'vitest';
import { CacheCoordinator, MemoryCacheStore } from '@/cache/cache';
import type { M2PageData } from './types';
import { M3RouteDataLoader, type RouteDatabaseReader } from './M3RouteDataLoader';

const now = new Date('2026-09-07T18:00:00Z');
function page(locale: 'br' | 'mx', fixtures = 1): M2PageData {
  return { locale, page: 'football', currentDate: 'date', timeZone: locale === 'br' ? 'America/Sao_Paulo' : 'America/Mexico_City',
    sportsData: { state: 'available', freshness: 'fresh', reason: fixtures ? 'ok' : 'no-data' },
    oddsData: { state: 'available', freshness: 'fresh', reason: 'no-data' }, competitions: fixtures ? ['Serie A'] : [],
    sections: fixtures ? [{ competition: 'Serie A', fixtures: [{ id: 'fixture', competition: 'Serie A', homeTeam: 'A', awayTeam: 'B',
      kickoff: now.toISOString(), status: 'SCHEDULED' as never, homeScore: null, awayScore: null, freshness: 'fresh', odds: [], oddsState: 'none' }] }] : [], paidOddsRequests: 0 };
}

describe('M3 route loader', () => {
  it('batches each route into one DB service call and caches repeated navigation', async () => {
    let dbCalls = 0;
    const database: RouteDatabaseReader = { loadOrThrow: async locale => { dbCalls++; return page(locale); } };
    const metrics: string[] = [];
    const loader = new M3RouteDataLoader(database, new CacheCoordinator(new MemoryCacheStore()), undefined, () => now, metric => metrics.push(metric.cache));
    const first = await loader.load('br', 'football');
    const second = await loader.load('br', 'football');
    expect(first.sections).toHaveLength(1);
    expect(second).toEqual(first);
    expect(dbCalls).toBe(1);
    expect(metrics).toEqual(['MISS', 'HIT']);
    expect(first.paidOddsRequests).toBe(0);
  });

  it('preserves stale DB data after a refresh failure', async () => {
    let time = 0;
    let fail = false;
    const clock = () => time;
    const database: RouteDatabaseReader = { loadOrThrow: async locale => { if (fail) throw new Error('database failed'); return page(locale); } };
    const loader = new M3RouteDataLoader(database, new CacheCoordinator(new MemoryCacheStore(clock), () => undefined, clock),
      { competitions: 1, teams: 1, fixtures: 1, scores: 1, odds: 1, finishedFixtures: 1, todayFixtures: 1, liveFixtures: 1,
        standings: 1, routeHome: 1, routeFootball: 1, routeToday: 1, routeLive: 1 }, () => now);
    await loader.load('br', 'football');
    time = 2_000; fail = true;
    const stale = await loader.load('br', 'football');
    expect(stale.sportsData.freshness).toBe('stale');
    expect(stale.sections[0].fixtures[0].freshness).toBe('stale');
  });

  it('keeps Mexico as a localized DB-backed empty result', async () => {
    const database: RouteDatabaseReader = { loadOrThrow: async () => page('mx', 0) };
    const data = await new M3RouteDataLoader(database, new CacheCoordinator(new MemoryCacheStore()), undefined, () => now).load('mx', 'football');
    expect(data.locale).toBe('mx');
    expect(data.sections).toEqual([]);
    expect(data.sportsData.reason).toBe('no-data');
  });

  it('returns one nontechnical unavailable state when DB has no stale value', async () => {
    const database: RouteDatabaseReader = { loadOrThrow: async () => { throw new Error('internal database detail'); } };
    const data = await new M3RouteDataLoader(database, new CacheCoordinator(new MemoryCacheStore()), undefined, () => now).load('br', 'home');
    expect(data.sections).toEqual([]);
    expect(data.sportsData).toMatchObject({ state: 'unavailable', reason: 'provider-error' });
    expect(JSON.stringify(data)).not.toContain('internal database detail');
  });
});
