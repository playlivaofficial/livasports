'use client';
import { useEffect, useMemo, useState } from 'react';
import { getDictionary } from '@/config/i18n';
import type { InterfaceLocale } from '@/localization/interface';
import type { SiteLocale } from '@/config/i18n';
import type { FixtureView } from '@/delivery/types';
import { MarketCode, OutcomeCode } from '@/domain/enums';
import { addSlipSelection, useSlip } from '@/slip/client';
import { canonicalSelection, selectionKey, SLIP_SCOPE } from '@/slip/types';
import { selectionLabel, slipCopy, type SlipUiLocale } from '@/slip/localization';
import { ApproximatePrice } from '@/components/odds/ApproximatePrice';

const MATCH_WINNER_CELLS = [
  { outcome: OutcomeCode.HOME, label: '1' },
  { outcome: OutcomeCode.DRAW, label: 'X' },
  { outcome: OutcomeCode.AWAY, label: '2' },
] as const;

const BOOK_ORDER = ['Betano BR', 'Betsson'] as const;
const BOOK_LABEL: Record<(typeof BOOK_ORDER)[number], string> = { 'Betano BR': 'Betano', Betsson: 'Betsson' };

type ListingPrice = { decimalOdds: number; expiresAt?: string; observedAt: string; priceKind: 'REAL' | 'PROXY'; targetBookmaker: string; sourceBookmaker: string; sourceBookmakerName: string; sourceQuoteId?: string; sourceObservedAt: string };

function bookFreshPrice(fixture: FixtureView, bookmaker: (typeof BOOK_ORDER)[number], outcome: OutcomeCode): ListingPrice | null {
  const prices = fixture.odds
    .filter(market => market.market === MarketCode.MATCH_WINNER)
    .flatMap(market => market.outcomes.filter(item => item.outcome === outcome))
    .flatMap(item => item.prices.filter(price => price.bookmaker === bookmaker && price.freshness === 'fresh' && Number.isFinite(price.decimalOdds)));
  if (!prices.length) return null;
  const best = prices.reduce((a, b) => a.decimalOdds >= b.decimalOdds ? a : b);
  const targetBookmaker = bookmaker === 'Betano BR' ? 'betano.bet.br' : 'betsson';
  return { decimalOdds: best.decimalOdds, ...(best.expiresAt ? { expiresAt: best.expiresAt } : {}), observedAt: best.sourceObservedAt ?? best.providerUpdatedAt,
    priceKind: best.priceKind ?? 'REAL', targetBookmaker: best.targetBookmaker ?? targetBookmaker,
    sourceBookmaker: best.sourceBookmaker ?? targetBookmaker, sourceBookmakerName: best.sourceBookmakerName ?? bookmaker,
    ...(best.sourceQuoteId ? {sourceQuoteId:best.sourceQuoteId} : {}), sourceObservedAt: best.sourceObservedAt ?? best.providerUpdatedAt };
}

export function listingBookmakerRows(fixture: FixtureView) {
  const native = BOOK_ORDER.map(bookmaker => ({
    bookmaker,
    label: BOOK_LABEL[bookmaker],
    cells: MATCH_WINNER_CELLS.map(cell => ({ ...cell, price: bookFreshPrice(fixture, bookmaker, cell.outcome) })),
  }));
  if (!native.some(book => book.cells.some(cell => cell.price !== null))) return [];
  return native.map((book, bookIndex) => ({...book,cells:book.cells.map((cell,cellIndex)=>{
    if(cell.price)return cell;
    const source=native[bookIndex===0?1:0].cells[cellIndex].price;
    if(!source||source.priceKind!=='REAL')return cell;
    return {...cell,price:{...source,priceKind:'PROXY' as const,targetBookmaker:book.bookmaker==='Betano BR'?'betano.bet.br':'betsson'}};
  })}));
}

export function OddsComparison({ locale, fixture, emptyLabel, commercialLocale = 'br' }: { locale: InterfaceLocale; fixture: FixtureView; emptyLabel?: string; commercialLocale?: SiteLocale }) {
  const saved = useSlip();
  const books = useMemo(() => listingBookmakerRows(fixture), [fixture]);
  const hasPrices = books.length > 0;
  const [clock, setClock] = useState<number | null>(null);
  // Empty rows have no quote to expire; avoid a timer and hydration update per unpriced fixture.
  useEffect(() => { if (!hasPrices) return; const tick = () => setClock(Date.now()); tick(); const timer = window.setInterval(tick, 30000); return () => window.clearInterval(timer); }, [hasPrices]);
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
  if (!books.length) {
    return <div className="odds-slot"><span className="odds-empty" title={unavailableLabel} aria-label={unavailableLabel}>—</span></div>;
  }
  const summary = books.map(book => `${book.label} ${book.cells.map(cell => cell.price === null ? '—' : cell.price.decimalOdds.toFixed(2)).join(' / ')}`).join(' · ');
  const approximateLabel = locale==='br'?'preço aproximado':locale==='mx'?'cuota aproximada':'approximate price';
  const proxySource = (name:string) => locale==='br'?`Fonte estimada: ${name}`:locale==='mx'?`Fuente estimada: ${name}`:`Estimated source: ${name}`;
  const selectable = /^[0-9a-f]{16}$/.test(fixture.publicId ?? '');
  return <div className="odds-slot" aria-label={`${labels.odds}: ${summary}. ${slipText.oddsMayChange}`}>
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
              const sourceTitle=cell.price?.priceKind==='PROXY'?proxySource(cell.price.sourceBookmakerName):undefined;
              if (intent && cell.price && !expired) {
                return <button type="button" key={cell.outcome} className={`listing-odds-cell listing-odds-select${pressed ? ' is-selected' : ''}`} aria-pressed={pressed} disabled={!saved.ready}
                  data-price-kind={cell.price.priceKind} data-target-bookmaker={cell.price.targetBookmaker} data-source-bookmaker={cell.price.sourceBookmaker} data-source-quote={cell.price.sourceQuoteId} data-source-observed-at={cell.price.sourceObservedAt} title={sourceTitle}
                  aria-label={`${pressed ? slipText.selected : slipText.add}: ${book.label}, ${slipText.markets.MATCH_WINNER}, ${selectionLabel(intent, uiLocale, { publicId: fixture.publicId!, home: fixture.homeTeam, away: fixture.awayTeam, competition: fixture.competition, kickoff: fixture.kickoff, status: fixture.status })}, ${priceLabel}, ${approximateLabel}${sourceTitle?`, ${sourceTitle}`:''}`}
                  onClick={event => { event.preventDefault(); event.stopPropagation(); const price=cell.price!;addSlipSelection(intent,commercialLocale,price.expiresAt!,price.targetBookmaker,{targetBookmaker:price.targetBookmaker,priceKind:price.priceKind,sourceBookmaker:price.sourceBookmaker,...(price.sourceQuoteId?{sourceQuoteId:price.sourceQuoteId}:{}),sourceObservedAt:price.sourceObservedAt}); }}>
                  {pressed ? <span className="listing-odds-check" aria-hidden="true">✓</span> : null}
                  <span className="listing-odds-label">{cell.label}</span>
                  <ApproximatePrice className="listing-odds-price" value={priceLabel} label={approximateLabel}/>
                </button>;
              }
              return <div key={cell.outcome} className={`listing-odds-cell${cell.price === null || expired ? ' is-muted' : ''}`} data-price-kind={cell.price?.priceKind??'UNAVAILABLE'} title={sourceTitle}>
                <span className="listing-odds-label">{cell.label}</span>
                {cell.price?<ApproximatePrice className="listing-odds-price" value={priceLabel} label={`${approximateLabel}${sourceTitle?`, ${sourceTitle}`:''}`}/>:<strong className="listing-odds-price">{priceLabel}</strong>}
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
  </div>;
}
