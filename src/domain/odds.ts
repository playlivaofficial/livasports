import type { CanonicalSelection, OddsQuote } from './entities';
import { MarketCode, OddsQuoteStatus, OutcomeCode } from './enums';

export interface OddsFreshnessPolicy { staleAfterSeconds: number; now?: Date; }

export function isQuoteFresh(quote: OddsQuote, policy: OddsFreshnessPolicy): boolean {
  const now = policy.now ?? new Date();
  return now.getTime() - quote.providerUpdatedAt.getTime() <= policy.staleAfterSeconds * 1000;
}

export function isUsableQuote(quote: OddsQuote, policy: OddsFreshnessPolicy): boolean {
  return quote.status === OddsQuoteStatus.ACTIVE && isQuoteFresh(quote, policy);
}

export function matchesSelection(quote: OddsQuote, selection: CanonicalSelection): boolean {
  if (quote.fixtureId !== selection.fixtureId || quote.market !== selection.market || quote.outcome !== selection.outcome) return false;
  if (selection.market === MarketCode.TOTAL_GOALS) return quote.line === selection.line;
  return quote.line === null && selection.line === null;
}

export function filterCurrentQuotes(quotes: readonly OddsQuote[], selection: CanonicalSelection, policy: OddsFreshnessPolicy): OddsQuote[] {
  return quotes.filter(quote => matchesSelection(quote, selection) && isUsableQuote(quote, policy));
}

export function findBestCurrentQuote(quotes: readonly OddsQuote[], selection: CanonicalSelection, policy: OddsFreshnessPolicy): OddsQuote | null {
  return filterCurrentQuotes(quotes, selection, policy).reduce<OddsQuote | null>(
    (best, quote) => !best || quote.decimalOdds > best.decimalOdds ? quote : best,
    null,
  );
}

export function bookmakerCoverage(
  quotes: readonly OddsQuote[], selection: CanonicalSelection, bookmakerIds: readonly OddsQuote['bookmakerId'][], policy: OddsFreshnessPolicy,
): ReadonlyMap<OddsQuote['bookmakerId'], OddsQuote | null> {
  const current = filterCurrentQuotes(quotes, selection, policy);
  return new Map(bookmakerIds.map(bookmakerId => [
    bookmakerId,
    current.filter(quote => quote.bookmakerId === bookmakerId).reduce<OddsQuote | null>(
      (best, quote) => !best || quote.decimalOdds > best.decimalOdds ? quote : best,
      null,
    ),
  ]));
}

export function validateSelection(selection: CanonicalSelection): void {
  if (selection.market === MarketCode.TOTAL_GOALS && selection.line === null) throw new Error('TOTAL_GOALS selections require an exact line');
  if (selection.market !== MarketCode.TOTAL_GOALS && selection.line !== null) throw new Error(`${selection.market} selections must not include a line`);
  const allowed: Record<MarketCode, readonly OutcomeCode[]> = {
    MATCH_WINNER: [OutcomeCode.HOME, OutcomeCode.DRAW, OutcomeCode.AWAY],
    TOTAL_GOALS: [OutcomeCode.OVER, OutcomeCode.UNDER],
    BTTS: [OutcomeCode.YES, OutcomeCode.NO],
  };
  if (!allowed[selection.market].includes(selection.outcome)) throw new Error(`${selection.outcome} is invalid for ${selection.market}`);
}

export function assertOneSelectionPerFixture(selections: readonly CanonicalSelection[]): void {
  const fixtureIds = new Set<string>();
  for (const selection of selections) {
    validateSelection(selection);
    if (fixtureIds.has(selection.fixtureId)) throw new Error('A comparison slip can contain at most one selection per fixture');
    fixtureIds.add(selection.fixtureId);
  }
}
