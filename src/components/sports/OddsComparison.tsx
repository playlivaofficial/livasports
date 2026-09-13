import { getDictionary } from '@/config/i18n';
import type { InterfaceLocale } from '@/localization/interface';
import type { FixtureView } from '@/delivery/types';
import { MarketCode, OutcomeCode } from '@/domain/enums';

const MATCH_WINNER_CELLS = [
  { outcome: OutcomeCode.HOME, label: '1' },
  { outcome: OutcomeCode.DRAW, label: 'X' },
  { outcome: OutcomeCode.AWAY, label: '2' },
] as const;

function bestFreshPrice(fixture: FixtureView, outcome: OutcomeCode): number | null {
  const prices = fixture.odds
    .filter(market => market.market === MarketCode.MATCH_WINNER)
    .flatMap(market => market.outcomes.filter(item => item.outcome === outcome))
    .flatMap(item => item.prices.filter(price => price.freshness === 'fresh' && Number.isFinite(price.decimalOdds)));
  if (!prices.length) return null;
  return Math.max(...prices.map(price => price.decimalOdds));
}

export function OddsComparison({ locale, fixture, emptyLabel }: { locale: InterfaceLocale; fixture: FixtureView; emptyLabel?: string }) {
  const labels = locale === 'en' ? {
    odds: 'Pregame odds',
    noOdds: 'Unavailable',
    staleOdds: 'Odds are out of date and were hidden.',
    oddsUnavailable: 'Fixtures are available, but odds could not be loaded.',
  } : getDictionary(locale).labels;
  const unavailableLabel = fixture.oddsState === 'stale' ? labels.staleOdds
    : fixture.oddsState === 'unavailable' ? labels.oddsUnavailable
      : emptyLabel ?? labels.noOdds;
  const cells = MATCH_WINNER_CELLS.map(cell => ({ ...cell, decimalOdds: bestFreshPrice(fixture, cell.outcome) }));
  if (cells.every(cell => cell.decimalOdds === null)) {
    return <div className="odds-slot"><span className="odds-empty" title={unavailableLabel} aria-label={unavailableLabel}>—</span></div>;
  }
  const summary = cells.map(cell => cell.decimalOdds === null ? '—' : cell.decimalOdds.toFixed(2)).join(' / ');
  return <div className="odds-slot" aria-label={`${labels.odds}: ${summary}`}>
    <div className="listing-odds">
      {cells.map(cell => <div key={cell.outcome} className="listing-odds-cell">
        <span className="listing-odds-label">{cell.label}</span>
        <strong className="listing-odds-price">{cell.decimalOdds === null ? '—' : cell.decimalOdds.toFixed(2)}</strong>
      </div>)}
    </div>
  </div>;
}
