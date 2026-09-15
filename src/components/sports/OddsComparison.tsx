'use client';
import { useEffect, useState } from 'react';
import { getDictionary } from '@/config/i18n';
import type { InterfaceLocale } from '@/localization/interface';
import type { SiteLocale } from '@/config/i18n';
import type { FixtureView } from '@/delivery/types';
import { MarketCode, OutcomeCode } from '@/domain/enums';
import { addSlipSelection, useSlip } from '@/slip/client';
import { canonicalSelection, selectionKey, SLIP_SCOPE } from '@/slip/types';
import { oddsFreshnessCompact, oddsFreshnessLabel, selectionLabel, slipCopy, type SlipUiLocale } from '@/slip/localization';

const MATCH_WINNER_CELLS = [
  { outcome: OutcomeCode.HOME, label: '1' },
  { outcome: OutcomeCode.DRAW, label: 'X' },
  { outcome: OutcomeCode.AWAY, label: '2' },
] as const;

const BOOK_ORDER = ['Betano BR', 'Betsson'] as const;
const BOOK_LABEL: Record<(typeof BOOK_ORDER)[number], string> = { 'Betano BR': 'Betano', Betsson: 'Betsson' };

function bookFreshPrice(fixture: FixtureView, bookmaker: (typeof BOOK_ORDER)[number], outcome: OutcomeCode): { decimalOdds: number; expiresAt?: string; observedAt: string } | null {
  const prices = fixture.odds
    .filter(market => market.market === MarketCode.MATCH_WINNER)
    .flatMap(market => market.outcomes.filter(item => item.outcome === outcome))
    .flatMap(item => item.prices.filter(price => price.bookmaker === bookmaker && price.freshness === 'fresh' && Number.isFinite(price.decimalOdds)));
  if (!prices.length) return null;
  const best = prices.reduce((a, b) => a.decimalOdds >= b.decimalOdds ? a : b);
  return { decimalOdds: best.decimalOdds, ...(best.expiresAt ? { expiresAt: best.expiresAt } : {}), observedAt: best.providerUpdatedAt };
}

export function listingBookmakerRows(fixture: FixtureView) {
  return BOOK_ORDER.map(bookmaker => ({
    bookmaker,
    label: BOOK_LABEL[bookmaker],
    cells: MATCH_WINNER_CELLS.map(cell => ({ ...cell, price: bookFreshPrice(fixture, bookmaker, cell.outcome) })),
  })).filter(book => book.cells.some(cell => cell.price !== null));
}

export function OddsComparison({ locale, fixture, emptyLabel, commercialLocale = 'br' }: { locale: InterfaceLocale; fixture: FixtureView; emptyLabel?: string; commercialLocale?: SiteLocale }) {
  const saved = useSlip();
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => { const tick = () => setClock(Date.now()); tick(); const timer = window.setInterval(tick, 30000); return () => window.clearInterval(timer); }, []);
  const uiLocale: SlipUiLocale = locale;
  const slipText = slipCopy[uiLocale];
  const labels = locale === 'en' ? {
    odds: 'Pregame odds',
    noOdds: 'Unavailable',
    staleOdds: 'Odds are out of date and were hidden.',
    oddsUnavailable: 'Fixtures are available, but odds could not be loaded.',
  } : getDictionary(locale).labels;
        const unavailableLabel = fixture.oddsState === 'stale' ? labels.staleOdds
    : fixture.oddsState === 'unavailable' ? labels.oddsUnavailable
      : emptyLabel ?? (locale==='br'?'Odds indisponíveis':locale==='mx'?'Cuotas no disponibles':'Odds unavailable');
  const books = listingBookmakerRows(fixture);
  if (!books.length) {
    return <div className="odds-slot"><span className="odds-empty" title={unavailableLabel} aria-label={unavailableLabel}>—</span></div>;
  }
  const summary = books.map(book => `${book.label} ${book.cells.map(cell => cell.price === null ? '—' : cell.price.decimalOdds.toFixed(2)).join(' / ')}`).join(' · ');
  const observed = books.flatMap(book => book.cells.map(cell => cell.price?.observedAt)).filter((v): v is string => !!v).sort().at(-1) ?? null;
  const freshness = clock ? oddsFreshnessLabel(observed, clock, uiLocale) : null;
  const compactFreshness = clock ? oddsFreshnessCompact(observed, clock, uiLocale) : null;
  const selectable = /^[0-9a-f]{16}$/.test(fixture.publicId ?? '');
  return <div className="odds-slot" aria-label={`${labels.odds}: ${summary}${freshness ? `. ${freshness}. ${slipText.oddsMayChange}` : ''}`}>
    <div className="listing-odds-books">
      {books.map(book => (
        <div className="listing-odds-book" key={book.bookmaker}>
          <span className="listing-odds-book-name">{book.label}</span>
          <div className="listing-odds">
            {book.cells.map(cell => {
              const intent = selectable ? canonicalSelection({ fixturePublicId: fixture.publicId, market: 'MATCH_WINNER', outcome: cell.outcome, line: null, scope: SLIP_SCOPE }) : null;
              const pressed = intent ? saved.slip.selections.some(s => selectionKey(s) === selectionKey(intent)) : false;
              const priceLabel = cell.price === null ? '—' : cell.price.decimalOdds.toFixed(2);
              const expired = !cell.price?.expiresAt || (clock !== null && clock >= Date.parse(cell.price.expiresAt));
              if (intent && cell.price && !expired) {
                return <button type="button" key={cell.outcome} className={`listing-odds-cell listing-odds-select${pressed ? ' is-selected' : ''}`} aria-pressed={pressed} disabled={!saved.ready}
                  aria-label={`${pressed ? slipText.selected : slipText.add}: ${book.label}, ${slipText.markets.MATCH_WINNER}, ${selectionLabel(intent, uiLocale, { publicId: fixture.publicId!, home: fixture.homeTeam, away: fixture.awayTeam, competition: fixture.competition, kickoff: fixture.kickoff, status: fixture.status })}, ${priceLabel}`}
                  onClick={event => { event.preventDefault(); event.stopPropagation(); addSlipSelection(intent, commercialLocale, cell.price!.expiresAt!, book.bookmaker === 'Betano BR' ? 'betano.bet.br' : 'betsson'); }}>
                  {pressed ? <span className="listing-odds-check" aria-hidden="true">✓</span> : null}
                  <span className="listing-odds-label">{cell.label}</span>
                  <strong className="listing-odds-price">{priceLabel}</strong>
                </button>;
              }
              return <div key={cell.outcome} className={`listing-odds-cell${cell.price === null || expired ? ' is-muted' : ''}`}>
                <span className="listing-odds-label">{cell.label}</span>
                <strong className="listing-odds-price">{priceLabel}</strong>
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
    {compactFreshness && observed ? <p className="listing-odds-fresh"><time dateTime={observed} title={`${freshness}. ${slipText.oddsMayChange}`}>{compactFreshness}</time></p> : null}
  </div>;
}
