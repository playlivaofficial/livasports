import { describe, expect, it } from 'vitest';
import { MarketCode, OddsQuoteStatus, OutcomeCode, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { OddsPapiNormalizer } from './normalizer';
import type { OddsPapiFixtureOdds, OddsPapiMarketDefinition } from './types';

const definitions: OddsPapiMarketDefinition[] = [
  { marketId: 1, marketName: 'Full Time Result', playerProp: false, sportId: 10, handicap: null,
    period: 'Full Time', marketType: '1x2', outcomes: [
      { outcomeId: 11, outcomeName: '1' }, { outcomeId: 12, outcomeName: 'X' }, { outcomeId: 13, outcomeName: '2' },
    ] },
  { marketId: 2, marketName: 'Full Time Total Goals', playerProp: false, sportId: 10, handicap: 2.5,
    period: 'Full Time', marketType: 'totals', outcomes: [
      { outcomeId: 21, outcomeName: 'Over' }, { outcomeId: 22, outcomeName: 'Under' },
    ] },
  { marketId: 3, marketName: 'Both Teams To Score', playerProp: false, sportId: 10, handicap: null,
    period: 'Full Time', marketType: 'yes_no', outcomes: [
      { outcomeId: 31, outcomeName: 'Yes' }, { outcomeId: 32, outcomeName: 'No' },
    ] },
  { marketId: 4, marketName: 'Double Chance', playerProp: false, sportId: 10, handicap: null,
    period: 'Full Time', marketType: 'double_chance', outcomes: [{ outcomeId: 41, outcomeName: '1X' }] },
];

describe('OddsPapi canonical normalization', () => {
  it('normalizes only the three enabled V1 markets and preserves exact total lines', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const fixtureId = domainId<'Fixture'>('internal-fixture');
    await mappings.getOrCreate(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, 'op-fixture-7', () => fixtureId,
      { tournamentId: 325 });
    const now = new Date('2026-09-02T12:00:00Z');
    const normalizer = new OddsPapiNormalizer(mappings, () => now);
    const price = (value: number) => ({ active: true, price: value, bookmakerChangedAt: '2026-09-02T11:59:00Z' });
    const fixture: OddsPapiFixtureOdds = {
      fixtureId: 'op-fixture-7', tournamentId: 325, statusId: 0,
      bookmakerOdds: { betsson: { markets: {
        '1': { outcomes: { '11': { players: { main: price(2.1) } }, '12': { players: { main: price(3.2) } }, '13': { players: { main: price(3.4) } } } },
        '2': { outcomes: { '21': { players: { main: price(1.91) } }, '22': { players: { main: price(1.89) } } } },
        '3': { outcomes: { '31': { players: { main: price(1.8) } }, '32': { players: { main: price(1.95) } } } },
        '4': { outcomes: { '41': { players: { main: price(1.2) } } } },
      } } },
    };

    const result = await normalizer.normalize([fixture], definitions, 'betsson');

    expect(new Set(result.quotes.map(quote => quote.market))).toEqual(new Set([
      MarketCode.MATCH_WINNER, MarketCode.TOTAL_GOALS, MarketCode.BTTS,
    ]));
    expect(result.quotes).toHaveLength(7);
    expect(result.quotes.every(quote => quote.fixtureId === fixtureId)).toBe(true);
    expect(result.quotes.every(quote => quote.status === OddsQuoteStatus.ACTIVE)).toBe(true);
    expect(result.quotes.find(quote => quote.outcome === OutcomeCode.OVER)?.line).toBe(2.5);
    expect(result.quotes.some(quote => (quote.market as string) === 'DOUBLE_CHANCE')).toBe(false);
  });

  it('reports an unmapped provider fixture instead of using its ID as a domain ID', async () => {
    const normalizer = new OddsPapiNormalizer(
      new ProviderMappingService(new InMemoryProviderEntityMappingRepository()),
    );
    const result = await normalizer.normalize([
      { fixtureId: 'provider-only', tournamentId: 325, statusId: 0 },
    ], definitions, 'betsson');
    expect(result.quotes).toEqual([]);
    expect(result.unmapped).toContainEqual({ entityType: 'FIXTURE', providerEntityId: 'provider-only' });
  });
});
