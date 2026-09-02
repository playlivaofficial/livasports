import type { CacheCoordinator } from '@/cache/cache';
import type { CompetitionRepository } from '@/repositories/contracts';
import type { SportsDataProvider } from '@/providers/contracts/SportsDataProvider';

export class CompetitionService {
  constructor(
    private readonly repository: CompetitionRepository,
    private readonly provider: SportsDataProvider,
    private readonly cache: CacheCoordinator,
    private readonly ttlSeconds: number,
  ) {}

  list(countryCodes: readonly string[] = []) {
    const key = `competitions:${[...countryCodes].sort().join(',') || 'all'}`;
    return this.cache.getOrLoad(key, this.ttlSeconds, async () => {
      const stored = await this.repository.list();
      if (stored.length) return stored;
      const normalized = await this.provider.getCompetitions(countryCodes);
      await this.repository.upsertMany(normalized);
      return normalized;
    });
  }
}
