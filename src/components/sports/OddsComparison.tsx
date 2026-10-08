'use client';
import {useEffect,useMemo,useState} from 'react';
import type {InterfaceLocale} from '@/localization/interface';
import type {SiteLocale} from '@/config/i18n';
import type {FixtureView} from '@/delivery/types';
import {MarketCode,OutcomeCode} from '@/domain/enums';
import {addSlipSelection,useSlip} from '@/slip/client';
import {canonicalSelection,selectionKey,SLIP_SCOPE} from '@/slip/types';
import {selectionLabel,slipCopy} from '@/slip/localization';
import {BOOKMAKER_REGISTRY,bookmakerConfig,isVisibleBookmaker} from '@/odds/registry';
import {geoForLocale,isCoreGeo} from '@/config/geo';
import {primaryVisibleBookmakers} from '@/odds/fallback-pool';
import {currentReferences,unavailableOddsLabel} from '@/odds/display';
import {BookmakerLogo} from '@/components/odds/BookmakerLogo';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';
import {matchPath} from '@/match-center/routes';
import {ReferenceOdds} from '@/components/odds/ReferenceOdds';
import {UnpricedSelections} from '@/components/odds/UnpricedSelections';

const CELLS=[{outcome:OutcomeCode.HOME,label:'1'},{outcome:OutcomeCode.DRAW,label:'X'},{outcome:OutcomeCode.AWAY,label:'2'}] as const;
type ListingPrice={decimalOdds:number;expiresAt?:string;observedAt:string;priceKind:'REAL'|'PROXY';targetBookmaker:string};
function bookFreshPrice(fixture:FixtureView,bookmaker:string,outcome:OutcomeCode):ListingPrice|null{
  const prices=fixture.odds.filter(m=>m.market===MarketCode.MATCH_WINNER&&m.line===null).flatMap(m=>m.outcomes.filter(o=>o.outcome===outcome))
    .flatMap(o=>o.prices.filter(p=>(p.targetBookmaker??BOOKMAKER_REGISTRY.find(b=>b.displayName===p.bookmaker)?.canonicalId)===bookmaker&&p.freshness==='fresh'&&Number.isFinite(p.decimalOdds)));
  if(!prices.length)return null;
  const best=prices.reduce((a,b)=>a.decimalOdds>=b.decimalOdds?a:b);
  return {decimalOdds:best.decimalOdds,expiresAt:best.expiresAt,observedAt:best.providerUpdatedAt,priceKind:best.priceKind??'REAL',targetBookmaker:bookmaker};
}
export function listingBookmakerRows(fixture:FixtureView,commercialLocale?:SiteLocale){
  const geo=commercialLocale?geoForLocale(commercialLocale):null;
  // Layout comes from the configured GEO pool, never quote availability.
  // Read-only callers without commercial context may only show supplied identities.
  const ids=geo?(isCoreGeo(geo)?primaryVisibleBookmakers(geo):[]):[...new Set(fixture.odds.filter(m=>m.market===MarketCode.MATCH_WINNER)
    .flatMap(m=>m.outcomes.flatMap(o=>o.prices.map(p=>p.targetBookmaker??BOOKMAKER_REGISTRY.find(b=>b.displayName===p.bookmaker)?.canonicalId))))]
    .filter((id):id is string=>!!id&&isVisibleBookmaker(id)).sort((a,b)=>(bookmakerConfig(a)?.displayOrder??100)-(bookmakerConfig(b)?.displayOrder??100));
  return ids.map(id=>({bookmaker:id,id,label:bookmakerConfig(id)?.displayName??id,cells:CELLS.map(cell=>({...cell,price:bookFreshPrice(fixture,id,cell.outcome)}))}));
}
export function OddsComparison({locale,fixture,emptyLabel,commercialLocale}:{locale:InterfaceLocale;fixture:FixtureView;emptyLabel?:string;commercialLocale?:SiteLocale}){
  const saved=useSlip();const books=useMemo(()=>listingBookmakerRows(fixture,commercialLocale),[fixture,commercialLocale]);
  const [clock,setClock]=useState<number|null>(null);
  // Existing stored quotes only. No provider polling is added for references.
  useEffect(()=>{const tick=()=>setClock(Date.now());tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer);},[]);
  const text=slipCopy[locale],unavailable=unavailableOddsLabel(locale);
  const current=(price:ListingPrice|null)=>!!price?.expiresAt&&(clock===null||clock<Date.parse(price.expiresAt));
  const references=currentReferences(fixture.referenceOdds,clock??Number.POSITIVE_INFINITY);
  const hasReal=books.some(b=>b.cells.some(c=>current(c.price)));
  const selectable=!!commercialLocale&&fixture.status==='SCHEDULED'&&/^[0-9a-f]{16}$/.test(fixture.publicId??'');
  return <div className="odds-slot" data-primary-count={books.length} aria-label={`${locale==='en'?'Pregame odds':locale==='br'?'Odds pré-jogo':'Cuotas prepartido'}. ${text.oddsMayChange}`}>
    {books.length?<div className="listing-odds-books">
      {books.map(book=>{
        const priced=book.cells.some(c=>current(c.price));
        return <div className={`listing-odds-book${priced?'':' is-unavailable'}`} key={book.id} data-primary-bookmaker={book.id}>
          <BookmakerLogo bookmaker={book.id} uiLocale={locale} sources={book.cells.flatMap(c=>c.price&&current(c.price)?[c.price]:[])}
            context={priced&&fixture.publicId&&commercialLocale?{locale:commercialLocale,placement:'match_odds_table',bookmaker:book.id,fixturePublicId:fixture.publicId,market:'MATCH_WINNER',pagePath:matchPath(commercialLocale,fixture.publicId,fixture.homeTeam,fixture.awayTeam)}:undefined}/>
          {priced?<div className="listing-odds">{book.cells.map(cell=>{
            const intent=selectable?canonicalSelection({fixturePublicId:fixture.publicId,market:'MATCH_WINNER',outcome:cell.outcome,line:null,scope:SLIP_SCOPE}):null;
            const pressed=!!intent&&saved.slip.selections.some(s=>selectionKey(s)===selectionKey(intent));
            const valid=current(cell.price),priceLabel=cell.price?.decimalOdds.toFixed(2);
            const price=valid?(cell.price?.priceKind==='PROXY'?<ApproximatePrice className="listing-odds-price" value={priceLabel!} label={text.oddsMayChange}/>:<strong className="listing-odds-price" data-price-kind="REAL">{priceLabel}</strong>):<span className="listing-odds-unavailable" aria-label={unavailable} title={unavailable}>—</span>;
            return intent&&cell.price&&valid?<button type="button" key={cell.outcome} className="listing-odds-cell listing-odds-select" aria-pressed={pressed} disabled={!saved.ready} data-target-bookmaker={book.id}
              aria-label={`${pressed?text.selected:text.add}: ${book.label}, ${selectionLabel(intent,locale,{publicId:fixture.publicId!,home:fixture.homeTeam,away:fixture.awayTeam,competition:fixture.competition,kickoff:fixture.kickoff,status:fixture.status})}, ${priceLabel}`}
              onClick={event=>{event.preventDefault(); event.stopPropagation();addSlipSelection(intent,commercialLocale!,cell.price!.expiresAt!,book.id,{targetBookmaker:book.id,priceKind:cell.price!.priceKind});}}>
              {pressed?<span className="listing-odds-check" aria-hidden="true">✓</span>:null}<span className="listing-odds-label">{cell.label}</span>{price}
            </button>:<div key={cell.outcome} className={`listing-odds-cell${valid?'':' is-muted'}`}><span className="listing-odds-label">{cell.label}</span>{price}</div>;
          })}</div>:<span className="listing-book-unavailable" aria-label={unavailable} title={emptyLabel??unavailable}>—</span>}
        </div>;
      })}
    </div>:<span className="odds-empty" aria-label={unavailable}>{unavailable}</span>}
    {references.length?<ReferenceOdds quotes={references} fixturePublicId={fixture.publicId} locale={commercialLocale} uiLocale={locale}/>:null}
    {!hasReal&&!references.length&&fixture.status==='SCHEDULED'?<UnpricedSelections fixturePublicId={fixture.publicId} kickoff={fixture.kickoff} locale={commercialLocale} uiLocale={locale}/>:null}
  </div>;
}
