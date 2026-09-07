import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';
import type { FixtureView } from '@/delivery/types';
import { OddsComparison } from './OddsComparison';

function fixture(freshness: 'fresh' | 'stale' = 'fresh', oddsState: FixtureView['oddsState'] = 'partial'): FixtureView {
  const price = (bookmaker: 'Betano BR' | 'Betsson', decimalOdds: number) => ({ bookmaker, decimalOdds, providerUpdatedAt: '2026-09-07T17:59:00.000Z', freshness });
  return { id: 'internal-fixture', competition: 'Serie A', homeTeam: 'Flamengo', awayTeam: 'Mirassol', kickoff: '2026-09-07T22:30:00.000Z',
    status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, freshness: 'fresh', oddsState,
    odds: [
      { market: MarketCode.MATCH_WINNER, line: null, outcomes: [
        { outcome: OutcomeCode.HOME, prices: [price('Betano BR', 1.9)] }, { outcome: OutcomeCode.DRAW, prices: [price('Betsson', 3.2)] },
        { outcome: OutcomeCode.AWAY, prices: [price('Betano BR', 4.1)] },
      ] },
      { market: MarketCode.TOTAL_GOALS, line: 2.5, outcomes: [
        { outcome: OutcomeCode.OVER, prices: [price('Betano BR', 1.8)] }, { outcome: OutcomeCode.UNDER, prices: [price('Betsson', 2.0)] },
      ] },
      { market: MarketCode.BTTS, line: null, outcomes: [
        { outcome: OutcomeCode.YES, prices: [price('Betano BR', 1.7)] }, { outcome: OutcomeCode.NO, prices: [price('Betsson', 2.1)] },
      ] },
    ] };
}

describe('read-only odds rendering', () => {
  it('renders MATCH_WINNER, exact 2.5 TOTAL_GOALS, BTTS, and partial coverage', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: fixture() }));
    expect(html).toContain('Resultado da partida');
    expect(html).toContain('Mais de 2.5');
    expect(html).toContain('Ambas marcam');
    expect(html).toContain('Betano BR');
    expect(html).toContain('Betsson');
    expect(html).toContain('Cobertura parcial');
  });

  it('hides stale prices and renders a freshness warning instead', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'mx', fixture: fixture('stale', 'stale') }));
    expect(html).toContain('desactualizadas');
    expect(html).not.toContain('1.90');
  });

  it('renders explicit no-odds coverage', () => {
    const value = { ...fixture(), odds: [], oddsState: 'none' as const };
    expect(renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: value }))).toContain('Indisponível');
  });
});
