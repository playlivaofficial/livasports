'use client';
import {useEffect,useRef} from 'react';
import type {SiteLocale} from '@/config/i18n';
import type {BookmakerSlip,SlipComparison as Comparison} from '@/slip/comparison-types';
import {canonicalSelection,wireSelection,validSlipId,type SavedSelection} from '@/slip/types';
import {bookmakerShortName,comparisonCopy} from '@/slip/comparison-copy';
import type {SlipUiLocale} from '@/slip/localization';
import {formatMoney,formatSlipOdds,parseStake,potentialReturn,indicativePotentialReturn} from '@/slip/decimal';
import {emitComparisonEvent} from '@/slip/comparison-events';
import {AffiliateLink} from '@/components/commercial/AffiliateLink';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';
import {BookmakerLogo} from '@/components/odds/BookmakerLogo';
import type {BookmakerId} from '@/odds/registry';
import {estimateLabels} from '@/odds/calculated-estimate';
import {CalculatedPrice} from '@/components/odds/CalculatedPrice';
import {selectionLabel} from '@/slip/localization';

function missingQuotes(book:BookmakerSlip){
  return book.selectionQuotes.filter(q=>q.decimalOdds===null);
}

export function SlipComparison({locale,selections,value,checking,uiLocale,stake,slipId,currencyLocale=locale}:{locale:SiteLocale;selections:SavedSelection[];value:Comparison|null;checking:boolean;uiLocale?:SlipUiLocale;currencyLocale?:SlipUiLocale;stake:string;slipId?:string}){
  const copyLocale:SlipUiLocale=uiLocale??locale;const text=comparisonCopy[copyLocale];const section=useRef<HTMLElement>(null);
  const estimateText=estimateLabels(copyLocale);
  const eventSignature=JSON.stringify({locale,selections:selections.map(s=>canonicalSelection(s)),bookmakers:value?.bookmakers??null});
  useEffect(()=>{
    const current=section.current;if(!current)return;
    const data=JSON.parse(eventSignature) as {locale:SiteLocale;selections:SavedSelection[];bookmakers:Comparison['bookmakers']|null};
    if(!data.bookmakers)return;
    const bookmakers=data.bookmakers;
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){if(!entry.isIntersecting)continue;
        if(entry.target===current)emitComparisonEvent('slip_comparison_view',data.locale,data.selections);
        else {const b=bookmakers.find(b=>b.bookmakerId===(entry.target as HTMLElement).dataset.bookmaker);
          if(b){emitComparisonEvent(b.complete?'slip_bookmaker_complete':'slip_bookmaker_partial',data.locale,data.selections,b);
            if(b.best)emitComparisonEvent('slip_best_price_view',data.locale,data.selections,b);}}
        observer.unobserve(entry.target);
      }
    },{threshold:0,root:current.closest('.slip-body')});
    observer.observe(current);current.querySelectorAll('.slip-bookmaker').forEach(card=>observer.observe(card));return()=>observer.disconnect();
  },[eventSignature]);
  const complete=value?.bookmakers.filter(b=>b.complete).length??0;
  return <section id="slip-comparison" className="slip-comparison" ref={section} aria-labelledby="slip-comparison-title" tabIndex={-1} data-states={value?.states.join(' ')}>
    <h3 id="slip-comparison-title">{text.title}</h3>
    <p className="sr-only" role="status" aria-live="polite">{value?text.summary(complete,value.bookmakers.length):''}</p>
    {!selections.length?<p className="slip-comparison-note">{text.empty}</p>:!value?<p className="slip-comparison-note">{checking?text.checking:text.unavailable}</p>:<>
      {!value.bookmakers.length?<p className="slip-comparison-note">{text.noBookmaker}</p>:value.bookmakers.map(b=>{
        const combined=b.complete&&b.combinedDecimalOdds?formatSlipOdds(b.combinedDecimalOdds,copyLocale):null;
        const estimated=combined&&b.combinedDecimalOdds?potentialReturn(stake,b.combinedDecimalOdds):null;
        const estimatedLabel=estimated?formatMoney(estimated,currencyLocale):null;
        const stakeOk=parseStake(stake)!==null;
        const missing=missingQuotes(b);
        const indicative=b.indicativeCombinedDecimalOdds&&b.indicativeComplete?formatSlipOdds(b.indicativeCombinedDecimalOdds,copyLocale):null;
        const indicativeReturn=indicative&&b.indicativeCombinedDecimalOdds?indicativePotentialReturn(stake,b.indicativeCombinedDecimalOdds):null;
        const calculated=b.selectionQuotes.filter(q=>q.estimate);
        const bookName=bookmakerShortName(b.bookmakerId,b.displayName);
        return <article className="slip-bookmaker" key={b.bookmakerId} aria-labelledby={`slip-bookmaker-${b.bookmakerId}`}
          data-bookmaker={b.bookmakerId} data-complete={b.complete} data-cta={b.ctaState}>
          <header><h4 id={`slip-bookmaker-${b.bookmakerId}`}><BookmakerLogo bookmaker={b.bookmakerId} uiLocale={copyLocale} sources={b.selectionQuotes.map(q=>({priceKind:q.priceKind??null}))} context={{locale,placement:'slip_bookmaker_comparison',bookmaker:b.bookmakerId as BookmakerId,selections:selections.map(wireSelection),...(validSlipId(slipId)?{slipId}:{})}}/></h4><span aria-label={`${text.available}: ${b.availableSelectionCount}/${b.requiredSelectionCount}`}>{b.availableSelectionCount}/{b.requiredSelectionCount}</span></header>
          {!b.complete&&!b.indicativeComplete?<p className="slip-coverage-state">{text.partial}</p>:null}
          {b.complete&&combined?<div className="slip-combined-block">
            <p className="slip-combined"><span>{text.combined}</span><strong><ApproximatePrice approximate={b.estimated} value={combined} label={b.estimated?estimateText.notExecutable:estimateText.real}/></strong></p>
            {estimatedLabel?<p className="slip-return"><span>{b.estimated?estimateText.indicativeReturn:estimateText.actualReturn}</span><strong>{estimatedLabel}</strong></p>:b.complete&&stakeOk?<p className="slip-comparison-note">{text.unavailable}</p>:null}
          </div>:b.complete?<p className="slip-comparison-note">{text.unavailable}</p>:missing.length?null:<p className="slip-comparison-note">{text.unavailable}</p>}
          {calculated.length?<div className="slip-indicative-comparison" data-executable="false">
            {indicative?<p className="slip-combined"><span>{estimateText.indicativeCombined}</span><strong><ApproximatePrice value={indicative} label={estimateText.notExecutable}/></strong></p>:null}
            {indicativeReturn?<p className="slip-return"><span>{estimateText.indicativeReturn}</span><strong>≈ {formatMoney(indicativeReturn,currencyLocale)}</strong></p>:null}
            <ul className="slip-calculated-legs">{calculated.map(q=><li key={`${q.selection.fixturePublicId}-${q.selection.market}-${q.selection.outcome}`}>
              <span>{q.fixture?`${q.fixture.home} vs ${q.fixture.away}`:q.selection.fixturePublicId} · {selectionLabel(q.selection,copyLocale,q.fixture)}</span>
              <CalculatedPrice estimate={q.estimate!} locale={copyLocale}/>
            </li>)}</ul>
          </div>:null}
          <AffiliateLink compact className="slip-bookmaker-cta" uiLocale={copyLocale} ariaLabel={text.ctaAt(bookName)} context={{locale,placement:'slip_bookmaker_comparison',cta:'visit',bookmaker:b.bookmakerId as BookmakerId,selections:selections.map(wireSelection),...(validSlipId(slipId)?{slipId}:{})}}>{text.ctaAt(bookName)} <span aria-hidden="true">↗</span></AffiliateLink>
        </article>;
      })}
      <p className="slip-comparison-note">{text.destination} {text.disclosure} {text.oddsMayChange}</p>
    </>}
  </section>;
}
