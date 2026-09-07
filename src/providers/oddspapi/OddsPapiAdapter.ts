import { V1_BOOKMAKERS, V1_MARKETS } from '@/domain/catalog';
import type { OddsQuote } from '@/domain/entities';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { NormalizedOddsBatch, OddsProvider, PregameOddsQuery } from '@/providers/contracts/OddsProvider';
import { OddsPapiNormalizer } from './normalizer';
import { reconcileOddsPapiFixtures } from './reconcile';
import { resolveOddsPapiTournamentId } from './tournament-map';
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
    const requestsBefore = this.gateway.requestCount();
    const mappings = await Promise.all(query.fixtureIds.map(id =>
      this.mappings.lookupByLivaSportsId(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, id)));
    const mappedTournamentIds = mappings.flatMap(mapping => {
      const id = mapping?.metadata.tournamentId;
      return typeof id === 'string' || typeof id === 'number' ? [String(id)] : [];
    });
    const candidateTournamentIds = (query.fixtures ?? []).flatMap(fixture => {
      const id = resolveOddsPapiTournamentId(fixture.countryCode, fixture.competitionName);
      return id ? [id] : [];
    });
    const tournamentIds = [...new Set([...mappedTournamentIds, ...candidateTournamentIds])];
    if (!tournamentIds.length) {
      return { quotes: [], unmappedProviderEntities: query.fixtureIds.map(id => ({ entityType: 'FIXTURE', providerEntityId: id as string })), providerRequests: 0 };
    }
    const definitions = await this.gateway.markets();
    const quotes: OddsQuote[] = [];
    const unmapped: Array<{ entityType: string; providerEntityId: string }> = [];
    const allowedBookmakers = new Set(V1_BOOKMAKERS.map(bookmaker => bookmaker.providerSlug));
    for (const bookmakerSlug of [...new Set(query.bookmakerSlugs)].filter(slug => allowedBookmakers.has(slug))) {
      const fixtures = await this.gateway.oddsByTournaments(tournamentIds, bookmakerSlug);
      if (query.fixtures?.length) {
        const reconciliation = await reconcileOddsPapiFixtures(query.fixtures, fixtures, this.mappings);
        unmapped.push(...reconciliation.missing.map(providerEntityId => ({ entityType: 'FIXTURE', providerEntityId })));
        unmapped.push(...reconciliation.ambiguous.map(providerEntityId => ({ entityType: 'AMBIGUOUS_FIXTURE', providerEntityId })));
      }
      const normalized = await this.normalizer.normalize(fixtures, definitions, bookmakerSlug);
      quotes.push(...normalized.quotes);
      unmapped.push(...normalized.unmapped);
    }
    return { quotes: quotes.filter(quote => query.fixtureIds.includes(quote.fixtureId)), unmappedProviderEntities: unmapped,
      providerRequests: this.gateway.requestCount() - requestsBefore };
  }
}
