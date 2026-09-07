import { describe, expect, it } from 'vitest';
import { CacheCoordinator, MemoryCacheStore } from '@/cache/cache';
import { V1_BOOKMAKERS } from '@/domain/catalog';
import type { Competition, Fixture, OddsQuote, Season, Team } from '@/domain/entities';
import { FixtureStatus, MarketCode, OddsQuoteStatus, OutcomeCode } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import type { NormalizedOddsBatch, OddsProvider } from '@/providers/contracts/OddsProvider';
import type { FixtureQuery, SportsDataProvider } from '@/providers/contracts/SportsDataProvider';
import { M2DataDeliveryService } from './M2DataDeliveryService';

const now = new Date('2026-09-07T18:00:00Z');
const competition: Competition = { id: domainId<'Competition'>('competition'), sportId: domainId<'Sport'>('sport'), countryId: domainId<'Country'>('br'), name: 'Serie A', slug: 'serie-a' };
const teams: Team[] = [
  { id: domainId<'Team'>('home'), sportId: domainId<'Sport'>('sport'), countryId: domainId<'Country'>('br'), name: 'Flamengo', shortName: null },
  { id: domainId<'Team'>('away'), sportId: domainId<'Sport'>('sport'), countryId: domainId<'Country'>('br'), name: 'Mirassol', shortName: null },
];
const scheduled: Fixture = { id: domainId<'Fixture'>('fixture'), sportId: domainId<'Sport'>('sport'), competitionId: competition.id,
  seasonId: domainId<'Season'>('season'), homeTeamId: teams[0].id, awayTeamId: teams[1].id, kickoff: new Date('2026-09-07T22:30:00Z'),
  status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, createdAt: now, updatedAt: now };

function sportsProvider(overrides: Partial<SportsDataProvider> = {}): SportsDataProvider {
  return {
    getCompetitions: async () => [competition], getSeasons: async () => [] as Season[], getTeams: async () => teams,
    getFixtures: async (query: FixtureQuery) => query.from < query.to ? [scheduled] : [], getFixture: async () => scheduled, getScores: async () => [scheduled],
    getEvents: async () => [], getStandings: async () => [], getLineups: async () => [], getStatistics: async () => [], getHeadToHead: async () => [], ...overrides,
  };
}

function quote(bookmakerIndex: number, market: MarketCode, outcome: OutcomeCode, line: number | null, updatedAt = new Date('2026-09-07T17:59:00Z')): OddsQuote {
  return { id: domainId<'OddsQuote'>(`${bookmakerIndex}-${market}-${outcome}`), fixtureId: scheduled.id, bookmakerId: V1_BOOKMAKERS[bookmakerIndex].id,
    market, outcome, line, decimalOdds: 1.9 + bookmakerIndex / 10, providerUpdatedAt: updatedAt, receivedAt: now, status: OddsQuoteStatus.ACTIVE };
}

function oddsProvider(result: NormalizedOddsBatch | Error): OddsProvider {
  return { getBookmakers: async () => [...V1_BOOKMAKERS], getMarkets: async () => [], getPregameOdds: async () => {
    if (result instanceof Error) throw result;
    return result;
  } };
}

const cache = () => new CacheCoordinator(new MemoryCacheStore());

describe('M2 data delivery', () => {
  it('renders all three canonical markets with two-bookmaker coverage and no provider IDs', async () => {
    const quotes = [0, 1].flatMap(bookmaker => [
      quote(bookmaker, MarketCode.MATCH_WINNER, OutcomeCode.HOME, null), quote(bookmaker, MarketCode.MATCH_WINNER, OutcomeCode.DRAW, null),
      quote(bookmaker, MarketCode.MATCH_WINNER, OutcomeCode.AWAY, null), quote(bookmaker, MarketCode.TOTAL_GOALS, OutcomeCode.OVER, 2.5),
      quote(bookmaker, MarketCode.TOTAL_GOALS, OutcomeCode.UNDER, 2.5), quote(bookmaker, MarketCode.BTTS, OutcomeCode.YES, null),
      quote(bookmaker, MarketCode.BTTS, OutcomeCode.NO, null),
    ]);
    const data = await new M2DataDeliveryService(sportsProvider(), oddsProvider({ quotes, unmappedProviderEntities: [], providerRequests: 3 }), cache(), { now: () => now }).load('br', 'today');
    const fixture = data.sections[0].fixtures[0];
    expect(fixture.oddsState).toBe('complete');
    expect(fixture.odds.map(market => market.market)).toEqual([MarketCode.MATCH_WINNER, MarketCode.TOTAL_GOALS, MarketCode.BTTS]);
    expect(fixture.odds.find(market => market.market === MarketCode.TOTAL_GOALS)?.line).toBe(2.5);
    expect(data.paidOddsRequests).toBe(3);
    expect(JSON.stringify(data)).not.toMatch(/providerEntityId|tournamentId|oddspapi-99/);
  });

  it('keeps missing bookmaker coverage partial and no-odds coverage explicit', async () => {
    const partial = await new M2DataDeliveryService(sportsProvider(), oddsProvider({ quotes: [quote(0, MarketCode.BTTS, OutcomeCode.YES, null)], unmappedProviderEntities: [], providerRequests: 2 }), cache(), { now: () => now }).load('br', 'today');
    expect(partial.sections[0].fixtures[0].oddsState).toBe('partial');
    const none = await new M2DataDeliveryService(sportsProvider(), oddsProvider({ quotes: [], unmappedProviderEntities: [], providerRequests: 2 }), cache(), { now: () => now }).load('br', 'today');
    expect(none.sections[0].fixtures[0].oddsState).toBe('none');
  });

  it('marks stale odds and never treats them as current', async () => {
    const staleQuote = quote(0, MarketCode.MATCH_WINNER, OutcomeCode.HOME, null, new Date('2026-09-07T16:00:00Z'));
    const data = await new M2DataDeliveryService(sportsProvider(), oddsProvider({ quotes: [staleQuote], unmappedProviderEntities: [], providerRequests: 2 }), cache(), { now: () => now, oddsStaleAfterSeconds: 300 }).load('br', 'today');
    expect(data.sections[0].fixtures[0].oddsState).toBe('stale');
    expect(data.sections[0].fixtures[0].odds[0].outcomes[0].prices[0].freshness).toBe('stale');
  });

  it('keeps fixtures visible when OddsPapi fails', async () => {
    const data = await new M2DataDeliveryService(sportsProvider(), oddsProvider(new Error('provider failed')), cache(), { now: () => now }).load('br', 'today');
    expect(data.sections[0].fixtures).toHaveLength(1);
    expect(data.sections[0].fixtures[0].oddsState).toBe('unavailable');
    expect(data.oddsData.state).toBe('unavailable');
  });

  it('returns a safe state with no fabricated fixtures when Sportmonks fails', async () => {
    const provider = sportsProvider({ getCompetitions: async () => { throw new Error('secret provider detail'); } });
    const data = await new M2DataDeliveryService(provider, null, cache(), { now: () => now }).load('br', 'today');
    expect(data.sections).toEqual([]);
    expect(data.sportsData).toMatchObject({ state: 'unavailable', reason: 'provider-error' });
    expect(JSON.stringify(data)).not.toContain('secret provider detail');
  });

  it('deduplicates concurrent fixture loads through the shared cache', async () => {
    let calls = 0;
    const provider = sportsProvider({ getFixtures: async () => { calls++; await Promise.resolve(); return [scheduled]; } });
    const service = new M2DataDeliveryService(provider, null, cache(), { now: () => now });
    await Promise.all([service.load('br', 'today'), service.load('br', 'today')]);
    expect(calls).toBe(1);
  });
});
