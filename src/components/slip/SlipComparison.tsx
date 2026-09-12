'use client';
import {useEffect,useRef} from 'react';
import type {SiteLocale} from '@/config/i18n';
import type {SlipComparison as Comparison} from '@/slip/comparison-types';
import {canonicalSelection,selectionKey,type SavedSelection} from '@/slip/types';
import {comparisonCopy} from '@/slip/comparison-copy';
import {selectionLabel,slipCopy} from '@/slip/localization';
import {formatCombinedOdds} from '@/slip/decimal';
import {emitComparisonEvent} from '@/slip/comparison-events';

export function SlipComparison({locale,selections,value,checking}:{locale:SiteLocale;selections:SavedSelection[];value:Comparison|null;checking:boolean}){
  const text=comparisonCopy[locale],slip=slipCopy[locale];const section=useRef<HTMLElement>(null);
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
    <h3 id="slip-comparison-title">{text.title}</h3><p className="slip-comparison-intro">{text.intro}</p>
    <p className="sr-only" role="status" aria-live="polite">{value?text.summary(complete,value.bookmakers.length):''}</p>
    {!selections.length?<p className="slip-comparison-note">{text.empty}</p>:!value?<p className="slip-comparison-note">{checking?text.checking:text.unavailable}</p>:<>
      {selections.length===1?<p className="slip-comparison-note">{text.one}</p>:null}
      {!value.bookmakers.length?<p className="slip-comparison-note">{text.noBookmaker}</p>:value.bookmakers.map(b=>{
        const missing=b.selectionQuotes.filter(q=>q.decimalOdds===null);
        const query=new URLSearchParams({locale,selections:JSON.stringify(selections.map(s=>canonicalSelection(s)))});
        return <article className={`slip-bookmaker${b.best?' is-best':''}`} key={b.bookmakerId} aria-labelledby={`slip-bookmaker-${b.bookmakerId}`} data-bookmaker={b.bookmakerId} data-complete={b.complete}>
          <header><h4 id={`slip-bookmaker-${b.bookmakerId}`}>{b.displayName}</h4><span aria-label={`${text.available}: ${b.availableSelectionCount}/${b.requiredSelectionCount}`}>{b.availableSelectionCount}/{b.requiredSelectionCount}</span></header>
          {b.best?<p className="slip-best-label">{b.tiedBest?text.tie:text.best}</p>:null}
          <p className="slip-coverage-state">{b.complete?text.complete:b.availableSelectionCount?text.partial:text.none}</p>
          {b.combinedDecimalOdds?<p className="slip-combined"><span>{text.combined}</span><strong>{formatCombinedOdds(b.combinedDecimalOdds,locale)}</strong></p>:<p className="slip-comparison-note">{text.noTotal}</p>}
          {missing.length?<details className="slip-missing" open><summary>{text.missing} ({missing.length})</summary><ul>{missing.map(q=><li key={selectionKey(q.selection)}><strong>{q.fixture?`${q.fixture.home} × ${q.fixture.away}`:slip.missing}</strong><span>{slip.markets[q.selection.market]} · {selectionLabel(q.selection,locale,q.fixture)}</span><span>{slip.states[q.state]}</span></li>)}</ul></details>:null}
          {b.ctaState==='ENABLED'?<><a className="slip-bookmaker-cta" href={`/go/slip/${b.bookmakerId}?${query}`} target="_blank" rel="sponsored nofollow noopener noreferrer" aria-label={`${text.cta} · ${b.displayName}`} onClick={()=>emitComparisonEvent('slip_bookmaker_click',locale,selections,b)}>{text.cta}<span aria-hidden="true">↗</span></a><p className="slip-comparison-note">{text.destination}</p></>:b.complete?<p className="slip-comparison-note">{text.gated}</p>:null}
        </article>;
      })}
      {value.bookmakers.some(b=>b.ctaState==='ENABLED')?<p className="slip-comparison-note">{text.disclosure}</p>:null}
    </>}
  </section>;
}
