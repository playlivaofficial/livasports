import type { Bookmaker, Market, OddsQuote } from '@/domain/entities';
import type { FixtureId } from '@/domain/ids';

export interface PregameOddsQuery {
  fixtureIds: readonly FixtureId[];
  bookmakerSlugs: readonly string[];
}

export interface NormalizedOddsBatch {
  quotes: OddsQuote[];
  unmappedProviderEntities: ReadonlyArray<{ entityType: string; providerEntityId: string }>;
  providerRequests: number;
}

export interface OddsProvider {
  getBookmakers(): Promise<Bookmaker[]>;
  getMarkets(): Promise<Market[]>;
  getPregameOdds(query: PregameOddsQuery): Promise<NormalizedOddsBatch>;
}
