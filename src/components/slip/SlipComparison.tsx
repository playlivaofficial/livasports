'use client';
import {useEffect,useRef} from 'react';
import type {SiteLocale} from '@/config/i18n';
import type {BookmakerSlip,ComparisonDiagnostic,SlipComparison as Comparison} from '@/slip/comparison-types';
import {canonicalSelection,selectionKey,validSlipId,type SavedSelection} from '@/slip/types';
import {comparisonCopy} from '@/slip/comparison-copy';
import {selectionLabel,slipCopy,type SlipUiLocale} from '@/slip/localization';
import {formatMoney,formatSlipOdds,moneyDiff,parseStake,potentialReturn} from '@/slip/decimal';
import {emitComparisonEvent} from '@/slip/comparison-events';
import {AffiliateLink} from '@/components/commercial/AffiliateLink';

function diagnosticCopy(code:ComparisonDiagnostic,text:typeof comparisonCopy.br,slip:typeof slipCopy.br){
  if(code==='STALE_QUOTE')return text.stale;
  if(code==='WITHDRAWN')return text.withdrawn;
  if(code==='FIXTURE_MISSING'||code==='MATCH_STARTED'||code==='MATCH_FINISHED')return text.fixtureUnavailable;
  if(code==='MARKET_MISSING')return text.marketUnavailable;
  if(code==='INVALID_QUOTE'||code==='SNAPSHOT_INCOMPATIBLE')return text.unavailable;
  return slip.states.UNAVAILABLE;
}
function incompleteGroups(book:BookmakerSlip,text:typeof comparisonCopy.br,slip:typeof slipCopy.br){
  const groups=new Map<string,{label:string;items:BookmakerSlip['selectionQuotes']}>();
  for(const quote of book.selectionQuotes.filter(q=>q.decimalOdds===null)){
    const label=diagnosticCopy(quote.diagnosticCode,text,slip);
    const group=groups.get(label)??{label,items:[]};
    group.items.push(quote);groups.set(label,group);
  }
  return [...groups.values()];
}

export function SlipComparison({locale,selections,value,checking,uiLocale,stake,slipId}:{locale:SiteLocale;selections:SavedSelection[];value:Comparison|null;checking:boolean;uiLocale?:SlipUiLocale;stake:string;slipId?:string}){
  const copyLocale:SlipUiLocale=uiLocale??locale;const text=comparisonCopy[copyLocale],slip=slipCopy[copyLocale];const section=useRef<HTMLElement>(null);
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
        const groups=incompleteGroups(b,text,slip);
        return <article className={`slip-bookmaker${b.best?' is-best':''}`} key={b.bookmakerId} aria-labelledby={`slip-bookmaker-${b.bookmakerId}`}
          data-bookmaker={b.bookmakerId} data-complete={b.complete} data-availability={b.availabilityState} data-cta={b.ctaState}>
          <header><h4 id={`slip-bookmaker-${b.bookmakerId}`}>{b.displayName}</h4><span aria-label={`${text.available}: ${b.availableSelectionCount}/${b.requiredSelectionCount}`}>{b.availableSelectionCount}/{b.requiredSelectionCount}</span></header>
          {b.best?<p className="slip-best-label">{b.tiedBest?text.tie:text.best}</p>:null}
          <p className="slip-coverage-state">{b.complete?text.complete:text.partial}</p>
          {b.complete&&combined?<div className="slip-combined-block">
            <p className="slip-combined"><span>{text.combined}</span><strong>{combined}</strong></p>
            {estimatedLabel?<p className="slip-return"><span>{text.potentialReturn}</span><strong>{estimatedLabel}</strong></p>:b.complete&&stakeOk?<p className="slip-comparison-note">{text.unavailable}</p>:null}
            {b.complete&&!b.best&&diff?(()=>{const label=formatMoney(diff,copyLocale);return label?<p className="slip-diff">{text.difference}: {label}</p>:null;})():null}
          </div>:b.complete?<p className="slip-comparison-note">{text.unavailable}</p>:groups.length?null:<p className="slip-comparison-note">{text.unavailable}</p>}
          {groups.map(group=><details className="slip-missing" open key={group.label} data-reason={group.label}>
            <summary>{text.missingCount(group.items.length)} {group.label}</summary>
            <ul>{group.items.map(q=><li key={selectionKey(q.selection)} data-diagnostic={q.diagnosticCode}>
              <strong>{q.fixture?`${q.fixture.home} vs ${q.fixture.away}`:text.fixtureUnavailable}</strong>
              <span>{slip.markets[q.selection.market]} — {selectionLabel(q.selection,copyLocale,q.fixture)}</span>
            </li>)}</ul>
          </details>)}
          {b.ctaState==='ENABLED'?<AffiliateLink className="slip-bookmaker-cta" uiLocale={copyLocale} context={{locale,placement:'slip_bookmaker_comparison',bookmaker:b.bookmakerId as 'betsson'|'betano.bet.br',selections:selections.map(s=>canonicalSelection(s)! ),...(validSlipId(slipId)?{slipId}:{})}}/>:b.complete?<p className="slip-comparison-note">{text.gated}</p>:null}
        </article>;
      })}
      <p className="slip-comparison-note">{text.oddsMayChange}</p>
    </>}
  </section>;
}
