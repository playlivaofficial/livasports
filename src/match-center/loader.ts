import 'server-only';
import type { Cache } from '@/cache/cache';
import { cacheKeys } from '@/cache/keys';
import type { SiteLocale } from '@/config/i18n';
import { FixtureStatus } from '@/domain/enums';
import type { MatchCenterView, MatchModule, MatchReadResult } from './types';
import type { MatchModuleMeta, PostgresMatchCenterRepository } from './repository';
import { isLiveSnapshotStale, latestSnapshotAt } from './rules';
import {loadOddsComparisons} from '@/odds/runtime';

const emptyMeta = (state: MatchModule<unknown>['state']): Omit<MatchModule<unknown>, 'data'> => ({ state, providerUpdatedAt: null, lastSuccessfulRefreshAt: null, snapshotAt: null });

export class MatchCenterLoader {
  constructor(private readonly repository: PostgresMatchCenterRepository, private readonly cache: Cache) {}

  private async cached<T>(fixtureId: string, locale: SiteLocale, scope: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    return (await this.cache.getOrSet(cacheKeys.matchModule(fixtureId, locale, scope), {
      ttlSeconds, staleIfErrorSeconds: 24 * 60 * 60, tags: [cacheKeys.fixture(fixtureId)],
    }, loader)).value;
  }

  async load(publicId: string, locale: SiteLocale): Promise<MatchReadResult> {
    const header = await this.cached(publicId, locale, 'header', 120, () => this.repository.header(publicId, locale));
    if (!header) return { kind: 'not-found' };
    const stateMap = await this.cached(header.id, locale, 'states-v2', 60, () => this.repository.moduleStates(header.id));
    const defaultState = header.status === FixtureStatus.SCHEDULED ? 'NOT_YET_AVAILABLE' : 'NO_DATA_IN_WINDOW';
    const wrap = <T>(module: string, data: T, fallback: MatchModule<T>['state']): MatchModule<T> => {
      const meta = stateMap[module] as MatchModuleMeta | undefined;
      return { ...(meta ?? emptyMeta(fallback)), data };
    };
    const calls = [
      this.cached(header.id, locale, 'events', 60, () => this.repository.events(header.id)),
      this.cached(header.id, locale, 'statistics', 120, () => this.repository.statistics(header.id)),
      this.cached(header.id, locale, 'lineups', 300, () => this.repository.lineups(header.id)),
      this.cached(header.id, locale, 'player-statistics', 300, () => this.repository.playerPerformances(header.id)),
      this.cached(header.id, locale, 'standings', 600, () => this.repository.standings(header)),
      this.cached(header.id, locale, 'form', 600, () => this.repository.form(header)),
      loadOddsComparisons(header.id,locale),
    ] as const;
    const [eventsResult, statisticsResult, lineupsResult, playerStatisticsResult, standingsResult, formResult, oddsResult] = await Promise.allSettled(calls);
    const value = <T>(result: PromiseSettledResult<T>, fallback: T): T => result.status === 'fulfilled' ? result.value : fallback;
    const state = <T>(result: PromiseSettledResult<T>, requested: MatchModule<T>): MatchModule<T> => result.status === 'fulfilled' ? requested : { ...requested, state: 'ERROR' };
    const eventsData = value(eventsResult, []); const statisticsData = value(statisticsResult, []); const lineupsData = value(lineupsResult, []);
    const playerStatisticsData=value(playerStatisticsResult,[]); const standingsData = value(standingsResult, []);
    const formData = value(formResult, { home: [], away: [], headToHead: [] }); const oddsData = value(oddsResult, []);
    const snapshotAt = latestSnapshotAt(Object.values(stateMap).map(meta => meta.snapshotAt));
    const match: MatchCenterView = { header,
      events: state(eventsResult, wrap('EVENTS', eventsData, defaultState)),
      statistics: state(statisticsResult, wrap('STATISTICS', statisticsData, defaultState)),
      lineups: state(lineupsResult, wrap('LINEUPS', lineupsData, defaultState)),
      playerStatistics: state(playerStatisticsResult, { ...emptyMeta(playerStatisticsData.length?'AVAILABLE':defaultState), data: playerStatisticsData }),
      standings: state(standingsResult, wrap('STANDINGS', standingsData, header.competitionType === 'DOMESTIC_CUP' ? 'NOT_APPLICABLE' : 'NO_DATA_IN_WINDOW')),
      form: state(formResult, { ...emptyMeta(formData.home.length || formData.away.length ? 'AVAILABLE' : 'NO_DATA_IN_WINDOW'), data: formData }),
      odds: { ...emptyMeta('NO_DATA_IN_WINDOW'), data: [] },
      oddsComparisons: oddsData,
      snapshotAt, liveSnapshotStale: isLiveSnapshotStale(header.status, header.providerUpdatedAt ?? snapshotAt), providerRequests: 0 };
    return { kind: 'found', match };
  }
}
