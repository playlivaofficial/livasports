import { V1_BOOKMAKERS, V1_MARKETS } from '@/domain/catalog';
import type { OddsQuote } from '@/domain/entities';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { NormalizedOddsBatch, OddsProvider, PregameOddsQuery } from '@/providers/contracts/OddsProvider';
import { OddsPapiNormalizer } from './normalizer';
import type { OddsPapiGateway } from './types';

export class OddsPapiAdapter implements OddsProvider {
  private readonly normalizer: OddsPapiNormalizer;
  constructor(private readonly gateway: OddsPapiGateway, private readonly mappings: ProviderMappingService) {
    this.normalizer = new OddsPapiNormalizer(mappings);
  }

  async getBookmakers() {
    const available = new Set((await this.gateway.bookmakers()).map(bookmaker => bookmaker.slug));
    return V1_BOOKMAKERS.filter(bookmaker => available.has(bookmaker.providerSlug)).map(bookmaker => ({ ...bookmaker }));
  }

  async getMarkets() { return V1_MARKETS.map(market => ({ ...market })); }

  async getPregameOdds(query: PregameOddsQuery): Promise<NormalizedOddsBatch> {
    const mappings = await Promise.all(query.fixtureIds.map(id =>
      this.mappings.lookupByLivaSportsId(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, id)));
    const missing = query.fixtureIds.filter((_, index) => !mappings[index])
      .map(id => ({ entityType: 'FIXTURE', providerEntityId: id as string }));
    const tournamentIds = [...new Set(mappings.flatMap(mapping => {
      const id = mapping?.metadata.tournamentId;
      return typeof id === 'string' || typeof id === 'number' ? [String(id)] : [];
    }))];
    const definitions = await this.gateway.markets();
    const quotes: OddsQuote[] = [];
    const unmapped: Array<{ entityType: string; providerEntityId: string }> = [...missing];
    for (const bookmakerSlug of query.bookmakerSlugs) {
      const fixtures = await this.gateway.oddsByTournaments(tournamentIds, bookmakerSlug);
      const normalized = await this.normalizer.normalize(fixtures, definitions, bookmakerSlug);
      quotes.push(...normalized.quotes);
      unmapped.push(...normalized.unmapped);
    }
    return { quotes: quotes.filter(quote => query.fixtureIds.includes(quote.fixtureId)), unmappedProviderEntities: unmapped,
      providerRequests: this.gateway.requestCount() };
  }
}
