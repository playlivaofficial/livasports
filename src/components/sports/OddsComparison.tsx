import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { BookmakerPriceView, FixtureView, MarketOddsView } from '@/delivery/types';
import { OutcomeCode } from '@/domain/enums';
import { PartialDataNotice } from './DataStates';

export function BookmakerPrice({ price }: { price: BookmakerPriceView }) {
  if (price.freshness !== 'fresh') return null;
  return <div className="flex min-w-28 items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
    <span className="text-xs text-slate-300">{price.bookmaker}</span><strong className="tabular-nums text-white">{price.decimalOdds.toFixed(2)}</strong>
  </div>;
}

function outcomeLabel(locale: SiteLocale, market: MarketOddsView, outcome: OutcomeCode): string {
  const dictionary = getDictionary(locale);
  const base = dictionary.outcomes[outcome];
  return market.line !== null && (outcome === OutcomeCode.OVER || outcome === OutcomeCode.UNDER) ? `${base} ${market.line}` : base;
}

export function OddsComparison({ locale, fixture }: { locale: SiteLocale; fixture: FixtureView }) {
  const dictionary = getDictionary(locale);
  if (fixture.oddsState === 'unavailable') return <p className="mt-4 text-xs text-amber-300">{dictionary.labels.oddsUnavailable}</p>;
  if (fixture.oddsState === 'stale') return <p className="mt-4 text-xs text-amber-300">{dictionary.labels.staleOdds}</p>;
  const markets = fixture.odds.map(market => ({ ...market, outcomes: market.outcomes.map(outcome => ({ ...outcome, prices: outcome.prices.filter(price => price.freshness === 'fresh') })) }))
    .filter(market => market.outcomes.some(outcome => outcome.prices.length));
  if (!markets.length) return <p className="mt-4 text-xs text-slate-500">{dictionary.labels.noOdds}</p>;
  return <div className="mt-5 border-t border-slate-800 pt-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{dictionary.labels.odds}</p>
    <div className="space-y-4">{markets.map(market => <section key={`${market.market}:${market.line ?? ''}`} aria-label={dictionary.markets[market.market]}>
      <h4 className="mb-2 text-sm font-medium text-slate-200">{dictionary.markets[market.market]}</h4>
      <div className="grid gap-2 lg:grid-cols-3">{market.outcomes.map(outcome => <div key={outcome.outcome} className="rounded-xl border border-slate-800 p-3">
        <p className="mb-2 text-xs text-slate-400">{outcomeLabel(locale, market, outcome.outcome)}</p>
        <div className="flex flex-wrap gap-2">{outcome.prices.map(price => <BookmakerPrice key={`${price.bookmaker}:${price.decimalOdds}`} price={price} />)}</div>
      </div>)}</div>
    </section>)}</div>
    {fixture.oddsState === 'partial' ? <PartialDataNotice locale={locale} /> : null}
  </div>;
}
