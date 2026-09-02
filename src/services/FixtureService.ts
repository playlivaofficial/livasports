import type { CacheCoordinator } from '@/cache/cache';
import type { FixtureId } from '@/domain/ids';
import type { SportsDataProvider } from '@/providers/contracts/SportsDataProvider';
import type { FixtureRepository } from '@/repositories/contracts';

export class FixtureService {
  constructor(
    private readonly repository: FixtureRepository,
    private readonly provider: SportsDataProvider,
    private readonly cache: CacheCoordinator,
    private readonly fixtureTtlSeconds: number,
  ) {}

  listBetween(from: Date, to: Date) {
    const key = `fixtures:${from.toISOString()}:${to.toISOString()}`;
    return this.cache.getOrLoad(key, this.fixtureTtlSeconds, async () => {
      const stored = await this.repository.listBetween(from, to);
      if (stored.length) return stored;
      const normalized = await this.provider.getFixtures({ from, to });
      await this.repository.upsertMany(normalized);
      return normalized;
    });
  }

  async getFixture(id: FixtureId) {
    const stored = await this.repository.findById(id);
    if (stored) return stored;
    const fixture = await this.provider.getFixture(id);
    if (fixture) await this.repository.upsertMany([fixture]);
    return fixture;
  }
}
