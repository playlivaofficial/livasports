import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';
import type { FixtureView } from '@/delivery/types';
import { OddsComparison,listingBookmakerRows } from './OddsComparison';
import { oddsFreshnessCompact } from '@/slip/localization';

function fixture(freshness: 'fresh' | 'stale' = 'fresh', oddsState: FixtureView['oddsState'] = 'partial'): FixtureView {
  const price = (bookmaker: 'Sportingbet BR' | 'Betsson', decimalOdds: number) => ({ bookmaker, decimalOdds, providerUpdatedAt: '2026-09-07T17:59:00.000Z', expiresAt:'2030-01-01T00:00:00Z', freshness });
  return { id: 'internal-fixture', competition: 'Serie A', homeTeam: 'Flamengo', awayTeam: 'Mirassol', kickoff: '2026-09-07T22:30:00.000Z',
    status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, freshness: 'fresh', oddsState,
    odds: [
      { market: MarketCode.MATCH_WINNER, line: null, outcomes: [
        { outcome: OutcomeCode.HOME, prices: [price('Sportingbet BR', 1.9), price('Betsson', 1.85)] },
        { outcome: OutcomeCode.DRAW, prices: [price('Betsson', 3.2)] },
        { outcome: OutcomeCode.AWAY, prices: [price('Sportingbet BR', 4.1)] },
      ] },
    ] };
}

describe('listing MATCH_WINNER cells', () => {
  it('renders compact 1 / X / 2 from current MATCH_WINNER prices', () => {
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'br', fixture: fixture() }));
    expect(html).toContain('listing-odds');
    expect(html).toContain('bookmaker-logo');
    expect(html).toContain('Sportingbet');
    expect(html).not.toContain('Betano');
    expect(html).toContain('Betsson');
    expect(html).toContain('>1<');
    expect(html).toContain('>X<');
    expect(html).toContain('>2<');
    expect(html).toContain('1.90');
    expect(html).toContain('1.85');
    expect(html).toContain('3.20');
    expect(html).toContain('4.10');
    expect(html.match(/odds-approx-mark/g)?.length).toBe(4);
    expect(html).not.toContain('data-price-kind="PROXY"');
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
    const html = renderToStaticMarkup(createElement(OddsComparison, { locale: 'co', commercialLocale:'co', fixture: value }));
    expect(html).toContain('listing-odds-select');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Agregar al boleto');
    expect(html).toContain('type="button"');
    expect(html).toContain('data-target-bookmaker="betsson"');
  });
  it.each(['mx','co','pe'] as const)('renders the supplied %s candidate rows without BR targets or invented proxy cells',locale=>{
    const value=fixture();value.publicId='aaaaaaaaaaaaaaaa';
    value.odds=[{market:MarketCode.MATCH_WINNER,line:null,outcomes:[
      {outcome:OutcomeCode.HOME,prices:[{bookmaker:'Codere',targetBookmaker:'codere',priceKind:'REAL',decimalOdds:2.1,providerUpdatedAt:'2026-09-07T17:59:00Z',expiresAt:'2030-01-01T00:00:00Z',freshness:'fresh'}]},
      {outcome:OutcomeCode.DRAW,prices:[{bookmaker:'Betano',targetBookmaker:'betano',priceKind:'REAL',decimalOdds:3.2,providerUpdatedAt:'2026-09-07T17:59:00Z',expiresAt:'2030-01-01T00:00:00Z',freshness:'fresh'}]},
      {outcome:OutcomeCode.AWAY,prices:[]},
    ]}];
    const rows=listingBookmakerRows(value);
    expect(rows.map(row=>row.id)).toEqual(['codere','betano']);
    expect(rows.map(row=>row.cells.filter(cell=>cell.price).length)).toEqual([1,1]);
    expect(rows.flatMap(row=>row.cells).every(cell=>!cell.price||cell.price.priceKind==='REAL')).toBe(true);
    const html=renderToStaticMarkup(createElement(OddsComparison,{locale,commercialLocale:locale,fixture:value}));
    expect(html).toContain('data-bookmaker-logo="codere"');expect(html).toContain('data-bookmaker-logo="betano"');
    expect(html).not.toContain('sportingbet');expect(html).not.toContain('betano.bet.br');expect(html).not.toContain('1xbet');
    expect(html).not.toContain('PROXY');expect(html).toContain('data-affiliate-enabled="false"');
    expect(html).not.toContain('href=');
  });
  it.each(['br','en'] as const)('does not enable slip actions from %s UI alone without a trusted commercial locale',locale=>{
    const value=fixture();value.publicId='aaaaaaaaaaaaaaaa';
    const html=renderToStaticMarkup(createElement(OddsComparison,{locale,fixture:value}));
    expect(html).not.toContain('listing-odds-select');expect(html).not.toContain('data-target-bookmaker=');
  });
  it('keeps compact listing freshness copy locale-independent of canonical 1X2 identity',()=>{
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:10:20.000Z'),'br')).toBe('Há 10m');
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:10:20.000Z'),'en')).toBe('Updated 10m');
    expect(oddsFreshnessCompact('2026-09-14T12:00:00.000Z',Date.parse('2026-09-14T12:00:20.000Z'),'mx')).toBe('Ahora');
  });
});
