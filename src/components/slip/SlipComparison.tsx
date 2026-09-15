'use client';
import {useEffect,useRef} from 'react';
import type {SiteLocale} from '@/config/i18n';
import type {BookmakerSlip,SlipComparison as Comparison} from '@/slip/comparison-types';
import {canonicalSelection,selectionKey,validSlipId,type SavedSelection} from '@/slip/types';
import {bookmakerShortName,comparisonCopy,missingLegReason} from '@/slip/comparison-copy';
import {selectionLabel,slipCopy,type SlipUiLocale} from '@/slip/localization';
import {formatMoney,formatSlipOdds,moneyDiff,parseStake,potentialReturn} from '@/slip/decimal';
import {emitComparisonEvent} from '@/slip/comparison-events';
import {AffiliateLink} from '@/components/commercial/AffiliateLink';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';

function missingQuotes(book:BookmakerSlip){
  return book.selectionQuotes.filter(q=>q.decimalOdds===null);
}

export function SlipComparison({locale,selections,value,checking,uiLocale,stake,slipId}:{locale:SiteLocale;selections:SavedSelection[];value:Comparison|null;checking:boolean;uiLocale?:SlipUiLocale;stake:string;slipId?:string}){
  const copyLocale:SlipUiLocale=uiLocale??locale;const text=comparisonCopy[copyLocale],slip=slipCopy[copyLocale];const section=useRef<HTMLElement>(null);
  const approximateLabel=copyLocale==='br'?'preço aproximado':copyLocale==='mx'?'cuota aproximada':'approximate price';
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
  const bestReturn=value?.bookmakers.find(b=>b.best&&b.combinedDecimalOdds)?.combinedDecimalOdds;
  const bestMoney=bestReturn?potentialReturn(stake,bestReturn):null;
  return <section id="slip-comparison" className="slip-comparison" ref={section} aria-labelledby="slip-comparison-title" tabIndex={-1} data-states={value?.states.join(' ')}>
    <h3 id="slip-comparison-title">{text.title}</h3><p className="slip-comparison-intro">{text.intro}</p>
    <p className="sr-only" role="status" aria-live="polite">{value?text.summary(complete,value.bookmakers.length):''}</p>
    {!selections.length?<p className="slip-comparison-note">{text.empty}</p>:!value?<p className="slip-comparison-note">{checking?text.checking:text.unavailable}</p>:<>
      {selections.length===1?<p className="slip-comparison-note">{text.one}</p>:null}
      {!value.bookmakers.length?<p className="slip-comparison-note">{text.noBookmaker}</p>:value.bookmakers.map(b=>{
        const combined=b.complete&&b.combinedDecimalOdds?formatSlipOdds(b.combinedDecimalOdds,copyLocale):null;
        const estimated=combined&&b.combinedDecimalOdds?potentialReturn(stake,b.combinedDecimalOdds):null;
        const estimatedLabel=estimated?formatMoney(estimated,copyLocale):null;
        const stakeOk=parseStake(stake)!==null;
        const diff=estimated&&bestMoney?moneyDiff(estimated,bestMoney):null;
        const missing=missingQuotes(b);
        const proxies=b.selectionQuotes.filter(q=>q.priceKind==='PROXY'&&q.decimalOdds!==null);
        const bookName=bookmakerShortName(b.bookmakerId,b.displayName);
        return <article className={`slip-bookmaker${b.best?' is-best':''}${b.estimated?' is-estimated':''}`} key={b.bookmakerId} aria-labelledby={`slip-bookmaker-${b.bookmakerId}`}
          data-bookmaker={b.bookmakerId} data-complete={b.complete} data-estimated={b.estimated} data-availability={b.availabilityState} data-cta={b.ctaState}>
          <header><h4 id={`slip-bookmaker-${b.bookmakerId}`}>{b.displayName}</h4><span aria-label={`${text.available}: ${b.availableSelectionCount}/${b.requiredSelectionCount}`}>{b.availableSelectionCount}/{b.requiredSelectionCount}</span></header>
          {b.best?<p className="slip-best-label">{b.tiedBest?text.tieEstimated:text.bestEstimated}</p>:null}
          <p className="slip-coverage-state">{b.complete?text.complete:text.partial}</p>
          {b.complete&&combined?<div className="slip-combined-block">
            <p className="slip-combined"><span>{text.combined}</span><strong><ApproximatePrice value={combined} label={approximateLabel}/></strong></p>
            {estimatedLabel?<p className="slip-return"><span>{text.estimatedPotentialReturn}</span><strong>{estimatedLabel}</strong></p>:b.complete&&stakeOk?<p className="slip-comparison-note">{text.unavailable}</p>:null}
            {b.complete&&!b.best&&diff?(()=>{const label=formatMoney(diff,copyLocale);return label?<p className="slip-diff">{text.difference}: {label}</p>:null;})():null}
          </div>:b.complete?<p className="slip-comparison-note">{text.unavailable}</p>:missing.length?null:<p className="slip-comparison-note">{text.unavailable}</p>}
          {proxies.length?<ul className="slip-proxy-legs" aria-label={text.bestEstimated}>{proxies.map(q=><li key={selectionKey(q.selection)} data-price-kind="PROXY" data-source-quote={q.sourceQuoteId??undefined}>
            <span>{q.fixture?`${q.fixture.home} vs ${q.fixture.away}`:text.fixtureUnavailable} · {slip.markets[q.selection.market]} — {selectionLabel(q.selection,copyLocale,q.fixture)}</span>
            <strong><ApproximatePrice value={formatSlipOdds(q.decimalOdds!,copyLocale)??''} label={text.proxyBasedOn(bookmakerShortName(q.sourceBookmakerId??'',q.sourceBookmakerName??''))}/></strong><small>{text.proxyBasedOn(bookmakerShortName(q.sourceBookmakerId??'',q.sourceBookmakerName??''))}</small>
          </li>)}</ul>:null}
          {!b.complete&&missing.length?<div className="slip-missing" data-reason="missing-legs">
            <p className="slip-missing-heading">{text.missingCount(missing.length)}</p>
            <ul>{missing.map(q=>{
              const reason=missingLegReason(q,bookName,copyLocale);
              return <li key={selectionKey(q.selection)} data-diagnostic={q.diagnosticCode} data-reason={reason}>
                <strong>{q.fixture?`${q.fixture.home} vs ${q.fixture.away}`:text.fixtureUnavailable}</strong>
                <span>{slip.markets[q.selection.market]} — {selectionLabel(q.selection,copyLocale,q.fixture)}</span>
                <small>{reason}</small>
              </li>;
            })}</ul>
          </div>:null}
          {b.ctaState==='ENABLED'?<AffiliateLink className="slip-bookmaker-cta" uiLocale={copyLocale} context={{locale,placement:'slip_bookmaker_comparison',bookmaker:b.bookmakerId as 'betsson'|'betano.bet.br',selections:selections.map(s=>canonicalSelection(s)! ),...(validSlipId(slipId)?{slipId}:{})}}>{text.ctaAt(bookName)} <span aria-hidden="true">↗</span></AffiliateLink>:b.complete?<p className="slip-comparison-note">{text.gated}</p>:null}
          <p className="slip-estimated-disclaimer">{text.estimatedDisclaimer}</p>
        </article>;
      })}
      <p className="slip-comparison-note">{text.oddsMayChange}</p>
    </>}
  </section>;
}
