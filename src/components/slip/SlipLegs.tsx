'use client';
import Link from 'next/link';
import {matchPath} from '@/localization/interface';
import type {SlipComparison as Comparison} from '@/slip/comparison-types';
import {bookmakerShortName,comparisonCopy,missingLegReason} from '@/slip/comparison-copy';
import {formatSlipOdds} from '@/slip/decimal';
import {selectionLabel,slipCopy,type SlipUiLocale} from '@/slip/localization';
import {selectionKey,type ResolvedSelection,type SavedSelection} from '@/slip/types';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';

function fixtureTitle(fixture:ResolvedSelection['fixture'],fallback:string){
  return fixture?`${fixture.home} vs ${fixture.away}`:fallback;
}

export function SlipLegs({uiLocale,selections,resolvedByKey,comparison,checking,onRemove,onNavigate}:{
  uiLocale:SlipUiLocale;selections:SavedSelection[];
  resolvedByKey:Map<string,ResolvedSelection>;comparison:Comparison|null;checking:boolean;
  resolvedAt:string|null;now:number;onRemove:(selection:SavedSelection,index:number)=>void;onNavigate?:()=>void;
}){
  const text=slipCopy[uiLocale];
  const approximateLabel=uiLocale==='br'?'preço aproximado':uiLocale==='mx'?'cuota aproximada':'approximate price';
  const books=comparison?.bookmakers??[];
  return <ol className="slip-list" aria-label={`${selections.length} ${selections.length===1?text.selection:text.selections}`}>
    {selections.map((s,index)=>{
      const key=selectionKey(s);const view=resolvedByKey.get(key);const fixture=view?.fixture;
      const title=fixtureTitle(fixture??null,checking?text.checking:text.missing);
      const price=view?.price?formatSlipOdds(view.price.decimalOdds,uiLocale):null;
      const quotes=books.map(b=>{
        const quote=b.selectionQuotes.find(q=>selectionKey(q.selection)===key)??null;
        return {id:b.bookmakerId,name:bookmakerShortName(b.bookmakerId,b.displayName),available:quote?.decimalOdds!==null&&quote?.decimalOdds!==undefined,priceKind:quote?.priceKind??null,sourceName:quote?.sourceBookmakerName??null,quote};
      });
      const missing=quotes.filter(q=>q.quote&&!q.available);
      let status:string;
      if(view?.state==='PRICE_CHANGED')status=text.legOddsChanged;
      else if(missing.length===1)status=text.unavailableAtBook(missing[0].name);
      else if(view)status=text.states[view.state];
      else status=checking?text.checking:text.states.UNAVAILABLE;
      return <li className="slip-item" key={key} data-selection={key} data-state={view?.state??'PENDING'}>
        <div className="slip-item-header">
          <div>{fixture?<Link href={`${matchPath(uiLocale,fixture.publicId,fixture.home,fixture.away)}#odds`} prefetch={false} onClick={()=>{if(onNavigate&&window.matchMedia('(max-width:1099px)').matches)onNavigate();}}>{title}</Link>:<strong>{title}</strong>}
            {fixture?<small>{fixture.competition}</small>:null}</div>
          <button type="button" className="slip-remove" aria-label={`${text.remove}: ${title}, ${selectionLabel(s,uiLocale,fixture)}`} onClick={()=>onRemove(s,index)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="slip-market"><span>{text.markets[s.market]}</span><strong>{selectionLabel(s,uiLocale,fixture)}</strong></p>
        <div className="slip-pick">
          {price?<strong className="slip-price"><ApproximatePrice value={price} label={approximateLabel}/></strong>:<span className="slip-no-price">{checking?text.checking:'—'}</span>}
        </div>
        {view?.state==='PRICE_CHANGED'&&view.previousDecimalOdds&&view.price&&formatSlipOdds(view.previousDecimalOdds,uiLocale)&&price?
          <p className="slip-reprice"><ApproximatePrice value={formatSlipOdds(view.previousDecimalOdds,uiLocale)!} label={approximateLabel}/> → <ApproximatePrice value={price} label={approximateLabel}/></p>:null}
        <div className={`slip-state${view?.state==='CURRENT'&&!missing.length?' is-current':''}${missing.length?' is-partial':''}`}>
          <span>{missing.length||(view&&view.state!=='CURRENT')?'! ':view?.state==='CURRENT'?'✓ ':''}{status}</span>
        </div>
        {quotes.length?<p className="slip-leg-books">{quotes.map(q=>
          <span key={q.id} data-bookmaker={q.id} data-available={q.available} data-price-kind={q.priceKind??'NONE'} title={q.priceKind==='PROXY'&&q.sourceName?`${q.name}: ${comparisonCopy[uiLocale].proxyBasedOn(bookmakerShortName('',q.sourceName))}`:undefined}>{q.name} {q.available?'✓':'—'}</span>
        )}</p>:null}
        {missing.length>1?<ul className="slip-leg-missing">{missing.map(q=>q.quote?
          <li key={q.id}>{missingLegReason(q.quote,q.name,uiLocale)}</li>:null)}</ul>:null}
      </li>;
    })}
  </ol>;
}
