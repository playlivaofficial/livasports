import { DEFAULT_INGESTION_WINDOW, FOOTBALL_COMPETITION_TARGETS, type FootballCompetitionTarget } from '@/config/footballCompetitions';
import type { Fixture } from '@/domain/entities';
import { SafeProviderError } from '@/providers/safe-error';
import type { FootballIngestionProvider } from '@/providers/contracts/FootballIngestionProvider';
import type { FootballIngestionStore, StoredSeason, SyncKind, WriteCounts } from './store';
import type { CacheInvalidator } from '@/cache/invalidation';
import { NoopCacheInvalidator } from '@/cache/invalidation';
import { cacheKeys, fixtureChangeTags } from '@/cache/keys';

export interface SyncResult extends WriteCounts { providerRequests: number; durationMs: number; }

function plus(...counts: readonly WriteCounts[]): WriteCounts {
  return counts.reduce((sum, row) => ({ inserted: sum.inserted + row.inserted, updated: sum.updated + row.updated }), { inserted: 0, updated: 0 });
}

function safeSyncMessage(error: unknown): string {
  if (error instanceof SafeProviderError) return `${error.context.provider} ${error.context.status} ${error.context.endpoint}: ${error.context.message}`;
  return 'Sync failed; inspect server logs for the sanitized provider or database diagnostic.';
}

function relevantSeasons<T extends { isCurrent?: boolean; startsAt: Date | null; endsAt: Date | null }>(rows: readonly T[], now: Date): T[] {
  const startFloor = new Date(now.getTime() - 120 * 86_400_000);
  const endCeiling = new Date(now.getTime() + 400 * 86_400_000);
  const relevant = rows.filter(row => row.isCurrent || ((!row.endsAt || row.endsAt >= startFloor) && (!row.startsAt || row.startsAt <= endCeiling)));
  if (relevant.length) return relevant;
  return [...rows].sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0)).slice(0, 1);
}

export class FootballIngestionService {
  constructor(
    private readonly provider: FootballIngestionProvider,
    private readonly store: FootballIngestionStore,
    private readonly targets: readonly FootballCompetitionTarget[] = FOOTBALL_COMPETITION_TARGETS,
    private readonly now: () => Date = () => new Date(),
    private readonly invalidator: CacheInvalidator = new NoopCacheInvalidator(),
  ) {}

  private async tracked(kind: SyncKind, work: () => Promise<WriteCounts>): Promise<SyncResult> {
    const runId = await this.store.startSync(kind, 'BR,MX');
    const before = this.provider.getRequestCount();
    const started = performance.now();
    try {
      const counts = await work();
      const providerRequests = this.provider.getRequestCount() - before;
      await this.store.finishSync(runId, counts, providerRequests);
      return { ...counts, providerRequests, durationMs: Math.round((performance.now() - started) * 10) / 10 };
    } catch (error) {
      const providerRequests = this.provider.getRequestCount() - before;
      await this.store.failSync(runId, safeSyncMessage(error), providerRequests);
      throw error;
    }
  }

  syncCompetitions() {
    return this.tracked('COMPETITIONS', async () => {
      const catalog = await this.provider.discoverCompetitions(this.targets);
      const counts = plus(await this.store.upsertCountries(catalog.countries), await this.store.upsertSport(catalog.sport),
        await this.store.upsertCompetitions(catalog.competitions));
      await this.invalidator.invalidateTags([cacheKeys.competitionList('br'), cacheKeys.competitionList('mx')]);
      return counts;
    });
  }

  syncSeasons() {
    return this.tracked('SEASONS', async () => {
      const competitions = await this.store.listTargetCompetitions();
      const rows: StoredSeason[] = [];
      for (const item of competitions) {
        const seasons = relevantSeasons(await this.provider.getSeasons(item.competition.id), this.now());
        rows.push(...seasons.map(season => ({ ...season, targetKey: item.targetKey })));
      }
      return this.store.upsertSeasons(rows);
    });
  }

  syncTeams() {
    return this.tracked('TEAMS', async () => {
      const seasons = await this.store.listRelevantSeasons();
      const counts: WriteCounts[] = [];
      for (const season of seasons) {
        const catalog = await this.provider.getTeamCatalog(season.id);
        counts.push(await this.store.upsertCountries(catalog.countries));
        counts.push(await this.store.upsertTeams(catalog.teams, season.id));
      }
      const result = plus(...counts);
      await this.invalidator.invalidateTags(fixtureChangeTags([]));
      return result;
    });
  }

  syncFixtures(daysPast = DEFAULT_INGESTION_WINDOW.daysPast, daysFuture = DEFAULT_INGESTION_WINDOW.daysFuture) {
    return this.tracked('FIXTURES', async () => {
      const competitions = await this.store.listTargetCompetitions();
      const now = this.now();
      const from = new Date(now.getTime() - daysPast * 86_400_000);
      const to = new Date(now.getTime() + daysFuture * 86_400_000);
      const fixtures = competitions.length ? await this.provider.getFixtures({ from, to, competitionIds: competitions.map(row => row.competition.id) }) : [];
      const counts = await this.store.upsertFixtures(fixtures);
      if (fixtures.length) await this.invalidator.invalidateTags(fixtureChangeTags(fixtures.map(row => row.id)));
      return counts;
    });
  }

  syncFixtureScores(limit = 50) {
    return this.tracked('SCORES', async () => {
      const candidates = await this.store.listFixturesForScoreSync(limit);
      const updates: Fixture[] = [];
      for (let index = 0; index < candidates.length; index += 50) {
        updates.push(...await this.provider.getScores(candidates.slice(index, index + 50).map(row => row.id)));
      }
      const counts = await this.store.upsertFixtures(updates);
      if (updates.length) await this.invalidator.invalidateTags(fixtureChangeTags(updates.map(row => row.id)));
      return counts;
    });
  }

  async syncFootball(): Promise<Record<string, SyncResult>> {
    return {
      competitions: await this.syncCompetitions(),
      seasons: await this.syncSeasons(),
      teams: await this.syncTeams(),
      fixtures: await this.syncFixtures(),
      scores: await this.syncFixtureScores(),
    };
  }
}
