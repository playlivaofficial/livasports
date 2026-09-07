import { describe, expect, it } from 'vitest';
import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';
import { getDictionary } from './i18n';

describe('M2 localization dictionaries', () => {
  it.each(['br', 'mx'] as const)('contains every reusable M2 label for %s', locale => {
    const dictionary = getDictionary(locale);
    expect(Object.values(dictionary.navigation).every(Boolean)).toBe(true);
    expect(Object.values(dictionary.pages).every(page => page.title && page.description)).toBe(true);
    expect(Object.values(dictionary.labels).every(Boolean)).toBe(true);
    expect(Object.values(FixtureStatus).every(status => dictionary.statuses[status])).toBe(true);
    expect(Object.values(MarketCode).every(market => dictionary.markets[market])).toBe(true);
    expect(Object.values(OutcomeCode).every(outcome => dictionary.outcomes[outcome])).toBe(true);
  });
});
