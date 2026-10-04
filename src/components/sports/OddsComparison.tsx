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
import {BOOKMAKER_REGISTRY,isVisibleBookmaker} from '@/odds/registry';
import {isSpanishLocale} from '@/config/geo';
import {BookmakerLogo} from '@/components/odds/BookmakerLogo';
import {matchPath} from '@/match-center/routes';

const MATCH_WINNER_CELLS = [
  { outcome: OutcomeCode.HOME, label: '1' },
  { outcome: OutcomeCode.DRAW, label: 'X' },
  { outcome: OutcomeCode.AWAY, label: '2' },
] as const;

type ListingPrice = { decimalOdds: number; expiresAt?: string; observedAt: string; priceKind: 'REAL' | 'PROXY'; targetBookmaker: string };

function bookFreshPrice(fixture: FixtureView, bookmaker: string, outcome: OutcomeCode): ListingPrice | null {
  const prices = fixture.odds
    .filter(market => market.market === MarketCode.MATCH_WINNER)
    .flatMap(market => market.outcomes.filter(item => item.outcome === outcome))
    .flatMap(item => item.prices.filter(price => (price.targetBookmaker??BOOKMAKER_REGISTRY.find(b=>b.displayName===price.bookmaker)?.canonicalId) === bookmaker && price.freshness === 'fresh' && Number.isFinite(price.decimalOdds)));
  if (!prices.length) return null;
  const best = prices.reduce((a, b) => a.decimalOdds >= b.decimalOdds ? a : b);
  return { decimalOdds: best.decimalOdds, ...(best.expiresAt ? { expiresAt: best.expiresAt } : {}), observedAt: best.providerUpdatedAt,
    priceKind: best.priceKind ?? 'REAL', targetBookmaker: bookmaker };
}

export function listingBookmakerRows(fixture: FixtureView) {
  // Only the server's exact-GEO public rows. Never fill empty rows from a global BR pool.
  const identities=new Map<string,string>();
  for(const price of fixture.odds.filter(m=>m.market===MarketCode.MATCH_WINNER).flatMap(m=>m.outcomes.flatMap(o=>o.prices))){
    const id=price.targetBookmaker??BOOKMAKER_REGISTRY.find(b=>b.displayName===price.bookmaker)?.canonicalId;
    if(id&&isVisibleBookmaker(id))identities.set(id,price.bookmaker);
  }
  const native = [...identities].map(([id,label]) => ({
    bookmaker:id,label,id,
    cells: MATCH_WINNER_CELLS.map(cell => ({ ...cell, price: bookFreshPrice(fixture, id, cell.outcome) })),
  }));
  if (!native.some(book => book.cells.some(cell => cell.price !== null))) return [];
  // The server resolves the cascade once. Never derive new proxies from display rows.
  return native;
}

export function OddsComparison({ locale, fixture, emptyLabel, commercialLocale }: { locale: InterfaceLocale; fixture: FixtureView; emptyLabel?: string; commercialLocale?: SiteLocale }) {
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
      : emptyLabel ?? (locale==='br'?'Odds indisponíveis':isSpanishLocale(locale)?'Cuotas no disponibles':'Odds unavailable');
  if (!books.length) {
    return <div className="odds-slot"><span className="odds-empty" title={unavailableLabel} aria-label={unavailableLabel}>—</span></div>;
  }
  const currentPrice = (price: ListingPrice | null) => !!price?.expiresAt && (clock === null || clock < Date.parse(price.expiresAt));
  const summary = books.map(book => `${book.label} ${book.cells.map(cell => currentPrice(cell.price) ? cell.price!.decimalOdds.toFixed(2) : '—').join(' / ')}`).join(' · ');
  const approximateLabel = locale==='br'?'preço aproximado':isSpanishLocale(locale)?'cuota aproximada':'approximate price';
  const selectable = !!commercialLocale&&/^[0-9a-f]{16}$/.test(fixture.publicId ?? '');
  return <div className="odds-slot" aria-label={`${labels.odds}: ${summary}. ${slipText.oddsMayChange}`}>
    <div className="listing-odds-books">
      {books.map(book => (
        <div className="listing-odds-book" key={book.bookmaker}>
          <BookmakerLogo bookmaker={book.id} uiLocale={locale} sources={book.cells.flatMap(c=>c.price&&currentPrice(c.price)?[c.price]:[])} context={fixture.publicId&&commercialLocale?{locale:commercialLocale,placement:'match_odds_table',bookmaker:book.id,fixturePublicId:fixture.publicId,market:'MATCH_WINNER',pagePath:matchPath(commercialLocale,fixture.publicId,fixture.homeTeam,fixture.awayTeam)}:undefined}/>
          <div className="listing-odds">
            {book.cells.map(cell => {
              const intent = selectable ? canonicalSelection({ fixturePublicId: fixture.publicId, market: 'MATCH_WINNER', outcome: cell.outcome, line: null, scope: SLIP_SCOPE }) : null;
              const pressed = intent ? saved.slip.selections.some(s => selectionKey(s) === selectionKey(intent)) : false;
              const priceLabel = cell.price === null ? '—' : cell.price.decimalOdds.toFixed(2);
              const expired = !cell.price?.expiresAt || (clock !== null && clock >= Date.parse(cell.price.expiresAt));
              if (intent && cell.price && !expired) {
                return <button type="button" key={cell.outcome} className={`listing-odds-cell listing-odds-select${pressed ? ' is-selected' : ''}`} aria-pressed={pressed} disabled={!saved.ready}
                  data-target-bookmaker={cell.price.targetBookmaker}
                  aria-label={`${pressed ? slipText.selected : slipText.add}: ${book.label}, ${slipText.markets.MATCH_WINNER}, ${selectionLabel(intent, uiLocale, { publicId: fixture.publicId!, home: fixture.homeTeam, away: fixture.awayTeam, competition: fixture.competition, kickoff: fixture.kickoff, status: fixture.status })}, ${priceLabel}, ${approximateLabel}`}
                  onClick={event => { event.preventDefault(); event.stopPropagation(); if(!commercialLocale)return;const price=cell.price!;addSlipSelection(intent,commercialLocale,price.expiresAt!,price.targetBookmaker,{targetBookmaker:price.targetBookmaker,priceKind:price.priceKind}); }}>
                  {pressed ? <span className="listing-odds-check" aria-hidden="true">✓</span> : null}
                  <span className="listing-odds-label">{cell.label}</span>
                  <ApproximatePrice className="listing-odds-price" value={priceLabel} label={approximateLabel}/>
                </button>;
              }
              return <div key={cell.outcome} className={`listing-odds-cell${cell.price === null || expired ? ' is-muted' : ''}`}>
                <span className="listing-odds-label">{cell.label}</span>
                {cell.price&&!expired?<ApproximatePrice className="listing-odds-price" value={priceLabel} label={approximateLabel}/>:<strong className="listing-odds-price">—</strong>}
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
  </div>;
}
