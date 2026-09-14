import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';
import type { FixtureView } from '@/delivery/types';
import { OddsComparison } from './OddsComparison';
import { oddsFreshnessCompact } from '@/slip/localization';

function fixture(freshness: 'fresh' | 'stale' = 'fresh', oddsState: FixtureView['oddsState'] = 'partial'): FixtureView {
  const price = (bookmaker: 'Betano BR' | 'Betsson', decimalOdds: number) => ({ bookmaker, decimalOdds, providerUpdatedAt: '2026-09-07T17:59:00.000Z', freshness });
  return { id: 'internal-fixture', competition: 'Serie A', homeTeam: 'Flamengo', awayTeam: 'Mirassol', kickoff: '2026-09-07T22:30:00.000Z',
    status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, freshness: 'fresh', oddsState,
    odds: [
      { market: MarketCode.MATCH_WINNER, line: null, outcomes: [
        { outcome: OutcomeCode.HOME, prices: [price('Betano BR', 1.9), price('Betsson', 1.85)] },
        { outcome: OutcomeCode.DRAW, prices: [price('Betsson', 3.2)] },
        { outcome: OutcomeCode.AWAY, prices: [price('Betano BR', 4.1)] },
      ] },
    ] };
}

describe('listing MATCH_WINNER cells', () => {
  it('renders compact 1 / X / 2 from current MATCH_WINNER prices', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: fixture() }));
    expect(html).toContain('listing-odds');
    expect(html).toContain('>1<');
    expect(html).toContain('>X<');
    expect(html).toContain('>2<');
    expect(html).toContain('1.90');
    expect(html).toContain('3.20');
    expect(html).toContain('4.10');
    expect(html).not.toContain('—');
  });

  it('hides stale prices and renders a freshness warning instead', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'mx', fixture: fixture('stale', 'stale') }));
    expect(html).toContain('desactualizadas');
    expect(html).not.toContain('1.90');
  });

  it('renders English labels without changing the 1X2 prices', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'en', fixture: fixture() }));
    expect(html).toContain('1.90');
    expect(html).toContain('Pregame odds');
  });

  it('renders explicit no-odds coverage', () => {
    const value = { ...fixture(), odds: [], oddsState: 'none' as const };
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: value }));
    expect(html).toContain('aria-label="Odds indisponíveis"');
    expect(html).toContain('>—</span>');
    expect(html).not.toContain('Sem odds');
  });

  it('turns fresh MATCH_WINNER cells into selectable buttons with a pressed state', () => {
    const value = fixture();
    value.publicId = 'aaaaaaaaaaaaaaaa';
    for (const outcome of value.odds[0].outcomes) for (const price of outcome.prices) price.expiresAt = '2030-01-01T12:00:00.000Z';
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: value }));
    expect(html).toContain('listing-odds-select');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Adicionar ao bilhete');
    expect(html).toContain('type="button"');
  });
  it('keeps compact listing freshness copy locale-independent of canonical 1X2 identity',()=>{
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:10:20.000Z'),'br')).toBe('Há 10m');
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:10:20.000Z'),'en')).toBe('Updated 10m');
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:00:20.000Z'),'mx')).toBe('Ahora');
  });
});
