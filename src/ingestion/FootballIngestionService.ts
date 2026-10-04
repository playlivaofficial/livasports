import { DEFAULT_INGESTION_WINDOW, APPROVED_COMPETITION_TARGETS, type FootballCompetitionTarget } from '@/config/footballCompetitions';
import type { Fixture } from '@/domain/entities';
import { SafeProviderError, sanitizeText } from '@/providers/safe-error';
import type { FootballIngestionProvider } from '@/providers/contracts/FootballIngestionProvider';
import type { FootballIngestionStore, StoredSeason, SyncKind, WriteCounts } from './store';
import type { CacheInvalidator } from '@/cache/invalidation';
import { NoopCacheInvalidator } from '@/cache/invalidation';
import { cacheKeys, fixtureChangeTags } from '@/cache/keys';
import { localeRoutes } from '@/config/i18n';
import type { SiteLocale } from '@/config/i18n';

export interface SyncResult extends WriteCounts { providerRequests: number; durationMs: number; }

function plus(...counts: readonly WriteCounts[]): WriteCounts {
  return counts.reduce((sum, row) => ({ inserted: sum.inserted + row.inserted, updated: sum.updated + row.updated }), { inserted: 0, updated: 0 });
}

function safeSyncMessage(error: unknown): string {
  if (error instanceof SafeProviderError) return `${error.context.provider} ${error.context.status} ${error.context.endpoint}: ${error.context.message}`;
  const message = error instanceof Error ? error.message : 'Unknown ingestion failure';
  const errorCode = typeof (error as { code?: unknown })?.code === 'string' && /^[0-9A-Z]{5}$/.test((error as { code: string }).code)
    ? (error as { code: string }).code : null;
  const knownOperationalMessage = /^(timeout exceeded when trying to connect|ON CONFLICT DO UPDATE command cannot affect row a second time)/i.test(message);
  if (!errorCode && !knownOperationalMessage) return 'Sync failed; inspect server logs for the sanitized provider or database diagnostic.';
  const secrets = [process.env.DATABASE_URL, process.env.DATABASE_POSTGRES_URL, process.env.POSTGRES_URL,
    process.env.DATABASE_PGPASSWORD, process.env.SPORTMONKS_API_KEY]
    .filter((value): value is string => Boolean(value));
  const safeMessage = sanitizeText(message, secrets).replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_DATABASE_URL]');
  return errorCode ? `${errorCode}: ${safeMessage}` : safeMessage;
}

function relevantSeasons<T extends { isCurrent?: boolean; startsAt: Date | null; endsAt: Date | null }>(
  rows: readonly T[],
  now: Date,
  strategy: FootballCompetitionTarget['seasonStrategy'] = 'STANDARD',
): T[] {
  const limit = strategy === 'SPLIT' ? 2 : 1;
  const current = rows.filter(row => row.isCurrent)
    .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
  if (current.length) return current.slice(0, limit);
  const startFloor = new Date(now.getTime() - 120 * 86_400_000);
  const endCeiling = new Date(now.getTime() + 400 * 86_400_000);
  const relevant = rows.filter(row => (!row.endsAt || row.endsAt >= startFloor) && (!row.startsAt || row.startsAt <= endCeiling))
    .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
  if (relevant.length) return relevant.slice(0, limit);
  return [...rows].sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0)).slice(0, limit);
}

export class FootballIngestionService {
  private stageErrors: Array<{ stage: SyncKind; target: string; error: string }> = [];
  private readonly selectedTargetIdentifiers: ReadonlySet<string>;

  constructor(
    private readonly provider: FootballIngestionProvider,
    private readonly store: FootballIngestionStore,
    private readonly targets: readonly FootballCompetitionTarget[] = APPROVED_COMPETITION_TARGETS,
    private readonly now: () => Date = () => new Date(),
    private readonly invalidator: CacheInvalidator = new NoopCacheInvalidator(),
  ) {
    this.selectedTargetIdentifiers = new Set(targets.flatMap(target => [target.key, target.slug]));
  }

  private selected<T extends { targetKey: string }>(rows: readonly T[]): T[] {
    return rows.filter(row => this.selectedTargetIdentifiers.has(row.targetKey));
  }

  private async tracked(kind: SyncKind, work: () => Promise<WriteCounts>): Promise<SyncResult> {
    this.stageErrors = [];
    const runId = await this.store.startSync(kind, 'MX,CO,PE');
    const before = this.provider.getRequestCount();
    const started = performance.now();
    try {
      const counts = await work();
      const providerRequests = this.provider.getRequestCount() - before;
      await this.store.finishSync(runId, counts, providerRequests, { errors: this.stageErrors });
      return { ...counts, providerRequests, durationMs: Math.round((performance.now() - started) * 10) / 10 };
    } catch (error) {
      const providerRequests = this.provider.getRequestCount() - before;
      await this.store.failSync(runId, safeSyncMessage(error), providerRequests);
      throw error;
    }
  }

  private recordError(stage: SyncKind, target: string, error: unknown) {
    this.stageErrors.push({ stage, target, error: safeSyncMessage(error) });
  }

  syncCompetitions() {
    return this.tracked('COMPETITIONS', async () => {
      const catalog = await this.provider.discoverCompetitions(this.targets);
      const counts = plus(await this.store.upsertCountries(catalog.countries), await this.store.upsertSport(catalog.sport),
        await this.store.upsertCompetitions(catalog.competitions));
      await this.invalidator.invalidateTags((Object.keys(localeRoutes) as SiteLocale[]).map(cacheKeys.competitionList));
      return counts;
    });
  }

  syncSeasons() {
    return this.tracked('SEASONS', async () => {
      const competitions = this.selected(await this.store.listTargetCompetitions());
      const rows: StoredSeason[] = [];
      for (const item of competitions) {
        try {
          const seasons = relevantSeasons(await this.provider.getSeasons(item.competition.id), this.now(), item.target?.seasonStrategy);
          rows.push(...seasons.map(season => ({ ...season, targetKey: item.targetKey })));
        } catch (error) {
          this.recordError('SEASONS', item.targetKey, error);
        }
      }
      return this.store.upsertSeasons(rows);
    });
  }

  syncTeams() {
    return this.tracked('TEAMS', async () => {
      const seasons = this.selected(await this.store.listRelevantSeasons());
      const counts: WriteCounts[] = [];
      for (const season of seasons) {
        try {
          const catalog = await this.provider.getTeamCatalog(season.id);
          counts.push(await this.store.upsertCountries(catalog.countries));
          counts.push(await this.store.upsertTeams(catalog.teams, season.id));
        } catch (error) {
          this.recordError('TEAMS', season.targetKey, error);
        }
      }
      const result = plus(...counts);
      await this.invalidator.invalidateTags(fixtureChangeTags([]));
      return result;
    });
  }

  syncFixtures(daysPast: number = DEFAULT_INGESTION_WINDOW.daysPast, daysFuture: number = DEFAULT_INGESTION_WINDOW.daysFuture) {
    return this.tracked('FIXTURES', async () => {
      const competitions = this.selected(await this.store.listTargetCompetitions());
      const now = this.now();
      const from = new Date(now.getTime() - daysPast * 86_400_000);
      const to = new Date(now.getTime() + daysFuture * 86_400_000);
      const batches = new Map<string, typeof competitions>();
      for (const competition of competitions) {
        const key = competition.target?.group ?? 'OTHER';
        const group = batches.get(key) ?? [];
        group.push(competition);
        batches.set(key, group);
      }
      const counts: WriteCounts[] = [];
      const changedIds: string[] = [];
      const persistBatch = async (rows: typeof competitions, fixtures: Fixture[]) => {
        counts.push(await this.store.upsertFixtures(fixtures));
        changedIds.push(...fixtures.map(row => row.id));
        const found = new Set(fixtures.map(row => row.competitionId));
        for (const row of rows) await this.store.updateCompetitionFixtureCoverage(row.competition.id, found.has(row.competition.id));
      };
      for (const [batch, rows] of batches) {
        try {
          const fixtures = await this.provider.getFixtures({ from, to, competitionIds: rows.map(row => row.competition.id) });
          await persistBatch(rows, fixtures);
        } catch (error) {
          this.recordError('FIXTURES', batch, error);
          if (!(error instanceof SafeProviderError)) continue;
          for (const row of rows) {
            try {
              const fixtures = await this.provider.getFixtures({ from, to, competitionIds: [row.competition.id] });
              await persistBatch([row], fixtures);
            } catch (competitionError) {
              this.recordError('FIXTURES', row.targetKey, competitionError);
            }
          }
        }
      }
      if (changedIds.length) await this.invalidator.invalidateTags(fixtureChangeTags(changedIds));
      return plus(...counts);
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
