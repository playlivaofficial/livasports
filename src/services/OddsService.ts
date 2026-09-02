import type { CacheCoordinator } from '@/cache/cache';
import type { CanonicalSelection, OddsQuote } from '@/domain/entities';
import type { BookmakerId, FixtureId } from '@/domain/ids';
import { bookmakerCoverage, findBestCurrentQuote, type OddsFreshnessPolicy } from '@/domain/odds';
import type { OddsProvider } from '@/providers/contracts/OddsProvider';
import type { OddsRepository } from '@/repositories/contracts';

export interface SelectionComparison {
  selection: CanonicalSelection;
  quotesByBookmaker: ReadonlyMap<BookmakerId, OddsQuote | null>;
  bestQuote: OddsQuote | null;
}

export class OddsService {
  constructor(
    private readonly repository: OddsRepository,
    private readonly provider: OddsProvider,
    private readonly cache: CacheCoordinator,
    private readonly freshness: OddsFreshnessPolicy,
    private readonly oddsTtlSeconds: number,
  ) {}

  async refreshPregameOdds(fixtureIds: readonly FixtureId[], bookmakerSlugs: readonly string[]) {
    const key = `pregame-odds:${[...fixtureIds].sort().join(',')}:${[...bookmakerSlugs].sort().join(',')}`;
    return this.cache.getOrLoad(key, this.oddsTtlSeconds, async () => {
      const batch = await this.provider.getPregameOdds({ fixtureIds, bookmakerSlugs });
      if (batch.quotes.length) {
        await Promise.all([this.repository.replaceCurrent(batch.quotes), this.repository.appendHistory(batch.quotes)]);
      }
      return batch;
    });
  }

  async compareSelection(selection: CanonicalSelection, bookmakerIds: readonly BookmakerId[]): Promise<SelectionComparison> {
    const quotes = await this.repository.listCurrentForFixtures([selection.fixtureId]);
    return { selection, quotesByBookmaker: bookmakerCoverage(quotes, selection, bookmakerIds, this.freshness),
      bestQuote: findBestCurrentQuote(quotes, selection, this.freshness) };
  }
}
