import { describe, expect, it } from 'vitest';
import type { CanonicalSelection, OddsQuote } from './entities';
import { MarketCode, OddsQuoteStatus, OutcomeCode } from './enums';
import { domainId } from './ids';
import { bookmakerCoverage, findBestCurrentQuote, matchesSelection } from './odds';

const fixtureId = domainId<'Fixture'>('fixture');
const betano = domainId<'Bookmaker'>('betano');
const betsson = domainId<'Bookmaker'>('betsson');
const now = new Date('2026-09-02T12:00:00Z');

function quote(overrides: Partial<OddsQuote> = {}): OddsQuote {
  return { id: domainId<'OddsQuote'>(crypto.randomUUID()), fixtureId, bookmakerId: betano,
    market: MarketCode.TOTAL_GOALS, outcome: OutcomeCode.OVER, line: 2.5, decimalOdds: 1.9,
    providerUpdatedAt: new Date('2026-09-02T11:59:00Z'), receivedAt: now, status: OddsQuoteStatus.ACTIVE, ...overrides };
}

describe('canonical odds logic', () => {
  const selection: CanonicalSelection = { fixtureId, market: MarketCode.TOTAL_GOALS, outcome: OutcomeCode.OVER, line: 2.5 };
  const policy = { staleAfterSeconds: 300, now };

  it('matches TOTAL_GOALS lines exactly', () => {
    expect(matchesSelection(quote(), selection)).toBe(true);
    expect(matchesSelection(quote({ line: 3.5 }), selection)).toBe(false);
  });

  it('excludes stale, suspended, and inactive quotes from best odds', () => {
    const best = findBestCurrentQuote([
      quote({ decimalOdds: 1.95 }),
      quote({ bookmakerId: betsson, decimalOdds: 2.5, status: OddsQuoteStatus.SUSPENDED }),
      quote({ bookmakerId: betsson, decimalOdds: 2.8, status: OddsQuoteStatus.CLOSED }),
      quote({ bookmakerId: betsson, decimalOdds: 2.9, status: OddsQuoteStatus.STALE }),
      quote({ bookmakerId: betsson, decimalOdds: 3, providerUpdatedAt: new Date('2026-09-02T11:00:00Z') }),
    ], selection, policy);
    expect(best?.decimalOdds).toBe(1.95);
  });

  it('keeps missing bookmaker coverage missing', () => {
    const coverage = bookmakerCoverage([quote()], selection, [betano, betsson], policy);
    expect(coverage.get(betano)?.decimalOdds).toBe(1.9);
    expect(coverage.get(betsson)).toBeNull();
  });

  it('does not confuse BTTS outcomes', () => {
    const bttsYes: CanonicalSelection = { fixtureId, market: MarketCode.BTTS, outcome: OutcomeCode.YES, line: null };
    expect(matchesSelection(quote({ market: MarketCode.BTTS, outcome: OutcomeCode.NO, line: null }), bttsYes)).toBe(false);
  });
});
