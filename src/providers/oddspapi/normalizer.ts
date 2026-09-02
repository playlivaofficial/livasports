import { V1_BOOKMAKERS } from '@/domain/catalog';
import type { OddsQuote } from '@/domain/entities';
import { MarketCode, OddsQuoteStatus, OutcomeCode, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId, newDomainId } from '@/domain/ids';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { OddsPapiFixtureOdds, OddsPapiMarketDefinition } from './types';

function canonicalMarket(definition: OddsPapiMarketDefinition): MarketCode | null {
  const name = definition.marketName.toLowerCase();
  const period = definition.period.toLowerCase();
  if ((definition.marketType === '1x2' || /full time result|regular time result/.test(name)) && /full|regular/.test(`${period} ${name}`)) return MarketCode.MATCH_WINNER;
  if (/both teams.*score|btts/.test(name)) return MarketCode.BTTS;
  if ((definition.marketType === 'totals' || /over.*under|total/.test(name)) && /full|regular/.test(`${period} ${name}`)) return MarketCode.TOTAL_GOALS;
  return null;
}

function canonicalOutcome(name: string, market: MarketCode): OutcomeCode | null {
  const value = name.trim().toLowerCase();
  if (market === MarketCode.MATCH_WINNER) return ({ '1': OutcomeCode.HOME, x: OutcomeCode.DRAW, '2': OutcomeCode.AWAY })[value] ?? null;
  if (market === MarketCode.TOTAL_GOALS) return value.startsWith('over') ? OutcomeCode.OVER : value.startsWith('under') ? OutcomeCode.UNDER : null;
  if (market === MarketCode.BTTS) return value === 'yes' ? OutcomeCode.YES : value === 'no' ? OutcomeCode.NO : null;
  return null;
}

export class OddsPapiNormalizer {
  constructor(private readonly mappings: ProviderMappingService, private readonly now: () => Date = () => new Date()) {}

  async normalize(fixtures: readonly OddsPapiFixtureOdds[], definitions: readonly OddsPapiMarketDefinition[], bookmakerSlug: string) {
    const definitionById = new Map(definitions.map(definition => [String(definition.marketId), definition]));
    const bookmaker = V1_BOOKMAKERS.find(item => item.providerSlug === bookmakerSlug);
    if (!bookmaker) return { quotes: [] as OddsQuote[], unmapped: [{ entityType: 'BOOKMAKER', providerEntityId: bookmakerSlug }] };
    const quotes: OddsQuote[] = [];
    const unmapped: Array<{ entityType: string; providerEntityId: string }> = [];
    for (const fixture of fixtures) {
      const fixtureMapping = await this.mappings.lookup(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, fixture.fixtureId);
      if (!fixtureMapping) { unmapped.push({ entityType: 'FIXTURE', providerEntityId: fixture.fixtureId }); continue; }
      const offeredBookmaker = fixture.bookmakerOdds?.[bookmakerSlug];
      if (!offeredBookmaker) continue;
      for (const [marketId, offeredMarket] of Object.entries(offeredBookmaker.markets ?? {})) {
        const definition = definitionById.get(marketId);
        if (!definition || definition.playerProp) continue;
        const market = canonicalMarket(definition);
        if (!market) continue; // DOUBLE_CHANCE and every non-V1 market stay disabled.
        for (const [outcomeId, offeredOutcome] of Object.entries(offeredMarket.outcomes ?? {})) {
          const outcomeName = definition.outcomes.find(outcome => String(outcome.outcomeId) === outcomeId)?.outcomeName;
          const outcome = outcomeName ? canonicalOutcome(outcomeName, market) : null;
          if (!outcome) continue;
          for (const price of Object.values(offeredOutcome.players ?? {})) {
            if (!Number.isFinite(price.price)) continue;
            const suspended = offeredBookmaker.suspended || offeredMarket.marketActive === false || price.active === false;
            quotes.push({ id: newDomainId<'OddsQuote'>(), fixtureId: domainId<'Fixture'>(fixtureMapping.livasportsEntityId),
              bookmakerId: bookmaker.id, market, outcome, line: market === MarketCode.TOTAL_GOALS ? definition.handicap : null,
              decimalOdds: price.price, providerUpdatedAt: new Date(price.bookmakerChangedAt ?? price.changedAt ?? this.now()),
              receivedAt: this.now(), status: suspended ? OddsQuoteStatus.SUSPENDED : OddsQuoteStatus.ACTIVE });
          }
        }
      }
    }
    return { quotes, unmapped };
  }
}
