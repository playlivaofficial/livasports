import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { BookmakerPriceView, FixtureView, MarketOddsView } from '@/delivery/types';
import { OutcomeCode } from '@/domain/enums';
import { PartialDataNotice } from './DataStates';

export function BookmakerPrice({ price }: { price: BookmakerPriceView }) {
  if (price.freshness !== 'fresh') return null;
  return <div className="bookmaker-price">
    <span className="bookmaker-name">{price.bookmaker}</span>
    <strong className="bookmaker-odds">{price.decimalOdds.toFixed(2)}</strong>
  </div>;
}

function outcomeLabel(locale: SiteLocale, market: MarketOddsView, outcome: OutcomeCode): string {
  const dictionary = getDictionary(locale);
  const base = dictionary.outcomes[outcome];
  return market.line !== null && (outcome === OutcomeCode.OVER || outcome === OutcomeCode.UNDER) ? `${base} ${market.line}` : base;
}

export function OddsComparison({ locale, fixture, emptyLabel }: { locale: SiteLocale; fixture: FixtureView; emptyLabel?: string }) {
  const dictionary = getDictionary(locale);
  const unavailableLabel = fixture.oddsState === 'stale' ? dictionary.labels.staleOdds
    : fixture.oddsState === 'unavailable' ? dictionary.labels.oddsUnavailable
      : emptyLabel ?? dictionary.labels.noOdds;
  const markets = fixture.odds.map(market => ({
    ...market,
    outcomes: market.outcomes.map(outcome => ({ ...outcome, prices: outcome.prices.filter(price => price.freshness === 'fresh') })),
  })).filter(market => market.outcomes.some(outcome => outcome.prices.length));

  if (!markets.length) return <div className="odds-slot"><span className="odds-empty" title={unavailableLabel} aria-label={unavailableLabel}>—</span></div>;

  return <>
    <div className="odds-slot"><span className="odds-empty">{dictionary.labels.odds}</span></div>
    <div className="odds-market-list">
      {markets.map(market => <section key={`${market.market}:${market.line ?? ''}`} aria-label={dictionary.markets[market.market]}>
        <h3 className="odds-market-title">{dictionary.markets[market.market]}</h3>
        <div className="odds-market-grid">
          {market.outcomes.map(outcome => <div key={outcome.outcome} className="odds-outcome">
            <p className="odds-outcome-label">{outcomeLabel(locale, market, outcome.outcome)}</p>
            <div>{outcome.prices.map(price => <BookmakerPrice key={`${price.bookmaker}:${price.decimalOdds}`} price={price} />)}</div>
          </div>)}
        </div>
      </section>)}
      {fixture.oddsState === 'partial' ? <PartialDataNotice locale={locale} /> : null}
    </div>
  </>;
}
