'use client';
import {useEffect,useRef} from 'react';
import type {SiteLocale} from '@/config/i18n';
import type {BookmakerSlip,SlipComparison as Comparison} from '@/slip/comparison-types';
import {canonicalSelection,validSlipId,type SavedSelection} from '@/slip/types';
import {bookmakerShortName,comparisonCopy} from '@/slip/comparison-copy';
import type {SlipUiLocale} from '@/slip/localization';
import {formatMoney,formatSlipOdds,parseStake,potentialReturn} from '@/slip/decimal';
import {emitComparisonEvent} from '@/slip/comparison-events';
import {AffiliateLink} from '@/components/commercial/AffiliateLink';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';
import {BookmakerLogo} from '@/components/odds/BookmakerLogo';
import type {BookmakerId} from '@/odds/registry';

function missingQuotes(book:BookmakerSlip){
  return book.selectionQuotes.filter(q=>q.decimalOdds===null);
}

export function SlipComparison({locale,selections,value,checking,uiLocale,stake,slipId,currencyLocale=locale}:{locale:SiteLocale;selections:SavedSelection[];value:Comparison|null;checking:boolean;uiLocale?:SlipUiLocale;currencyLocale?:SlipUiLocale;stake:string;slipId?:string}){
  const copyLocale:SlipUiLocale=uiLocale??locale;const text=comparisonCopy[copyLocale];const section=useRef<HTMLElement>(null);
  const approximateLabel=copyLocale==='br'?'preço aproximado':copyLocale==='en'?'approximate price':'cuota aproximada';
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
        const bookName=bookmakerShortName(b.bookmakerId,b.displayName);
        return <article className="slip-bookmaker" key={b.bookmakerId} aria-labelledby={`slip-bookmaker-${b.bookmakerId}`}
          data-bookmaker={b.bookmakerId} data-complete={b.complete} data-cta={b.ctaState}>
          <header><h4 id={`slip-bookmaker-${b.bookmakerId}`}><BookmakerLogo bookmaker={b.bookmakerId} uiLocale={copyLocale} sources={b.selectionQuotes.map(q=>({priceKind:q.priceKind??null}))} context={{locale,placement:'slip_bookmaker_comparison',bookmaker:b.bookmakerId as BookmakerId,selections:selections.map(s=>canonicalSelection(s)!),...(validSlipId(slipId)?{slipId}:{})}}/></h4><span aria-label={`${text.available}: ${b.availableSelectionCount}/${b.requiredSelectionCount}`}>{b.availableSelectionCount}/{b.requiredSelectionCount}</span></header>
          {!b.complete?<p className="slip-coverage-state">{text.partial}</p>:null}
          {b.complete&&combined?<div className="slip-combined-block">
            <p className="slip-combined"><span>{text.combined}</span><strong><ApproximatePrice value={combined} label={approximateLabel}/></strong></p>
            {estimatedLabel?<p className="slip-return"><span>{text.potentialReturn}</span><strong>{estimatedLabel}</strong></p>:b.complete&&stakeOk?<p className="slip-comparison-note">{text.unavailable}</p>:null}
          </div>:b.complete?<p className="slip-comparison-note">{text.unavailable}</p>:missing.length?null:<p className="slip-comparison-note">{text.unavailable}</p>}
          {b.ctaState==='ENABLED'?<AffiliateLink compact className="slip-bookmaker-cta" uiLocale={copyLocale} context={{locale,placement:'slip_bookmaker_comparison',bookmaker:b.bookmakerId as BookmakerId,selections:selections.map(s=>canonicalSelection(s)! ),...(validSlipId(slipId)?{slipId}:{})}}>{text.ctaAt(bookName)} <span aria-hidden="true">↗</span></AffiliateLink>:b.complete?<p className="slip-comparison-note">{text.gated}</p>:null}
        </article>;
      })}
      <p className="slip-comparison-note">{text.destination} {text.disclosure} {text.oddsMayChange}</p>
    </>}
  </section>;
}
