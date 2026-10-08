'use client';
import Link from 'next/link';
import {matchPath} from '@/localization/interface';
import type {SlipComparison as Comparison} from '@/slip/comparison-types';
import {bookmakerShortName,missingLegReason} from '@/slip/comparison-copy';
import {formatSlipOdds} from '@/slip/decimal';
import {selectionLabel,slipCopy,type SlipUiLocale} from '@/slip/localization';
import {selectionKey,type ResolvedSelection,type SavedSelection} from '@/slip/types';
import {ApproximatePrice} from '@/components/odds/ApproximatePrice';

function fixtureTitle(fixture:ResolvedSelection['fixture'],fallback:string){
  return fixture?`${fixture.home} vs ${fixture.away}`:fallback;
}
const intlLocale={br:'pt-BR',mx:'es-MX',co:'es-CO',pe:'es-PE',en:'en-GB'} as const;
/** Day and time in the visitor's own zone; the element keeps the machine-readable kickoff. */
function kickoffLabel(kickoff:string,uiLocale:SlipUiLocale){
  const date=new Date(kickoff);
  if(!Number.isFinite(date.getTime()))return null;
  return new Intl.DateTimeFormat(intlLocale[uiLocale],{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
}

export function SlipLegs({uiLocale,selections,resolvedByKey,comparison,checking,onRemove,onNavigate}:{
  uiLocale:SlipUiLocale;selections:SavedSelection[];
  resolvedByKey:Map<string,ResolvedSelection>;comparison:Comparison|null;checking:boolean;
  resolvedAt:string|null;now:number;onRemove:(selection:SavedSelection,index:number)=>void;onNavigate?:()=>void;
}){
  const text=slipCopy[uiLocale];
  const approximateLabel=uiLocale==='br'?'preço aproximado':uiLocale==='en'?'approximate price':'cuota aproximada';
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
      const indicative=view?.price?.priceKind==='INDICATIVE';
      const coverage=indicative?'INDICATIVE':price?'REAL':'UNAVAILABLE';
      const coverageLabel=indicative?(uiLocale==='br'?'Cotação indicativa':uiLocale==='en'?'Indicative odds':'Cuota orientativa'):price?(uiLocale==='en'?'Real quote':uiLocale==='br'?'Cotação real':'Cuota real'):text.states.UNAVAILABLE;
      return <li className="slip-item" key={key} data-selection={key} data-state={view?.state??'PENDING'} data-coverage={coverage}>
        <div className="slip-item-header">
          <div>
            {fixture?<p className="slip-fixture-meta"><span>{fixture.competition}</span>{kickoffLabel(fixture.kickoff,uiLocale)?<time dateTime={fixture.kickoff}>{kickoffLabel(fixture.kickoff,uiLocale)}</time>:null}</p>:null}
            {fixture?<Link href={`${matchPath(uiLocale,fixture.publicId,fixture.home,fixture.away)}#odds`} prefetch={false} onClick={()=>{if(onNavigate&&window.matchMedia('(max-width:1099px)').matches)onNavigate();}}>{title}</Link>:<strong>{title}</strong>}
            </div>
          <button type="button" className="slip-remove" aria-label={`${text.remove}: ${title}, ${selectionLabel(s,uiLocale,fixture)}`} onClick={()=>onRemove(s,index)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="slip-market"><span>{text.markets[s.market]}</span><strong>{selectionLabel(s,uiLocale,fixture)}</strong></p>
        <div className="slip-pick">
          {price?<strong className="slip-price">{indicative?<ApproximatePrice value={price} label={coverageLabel}/>:price}</strong>:<span className="slip-no-price">{checking?text.checking:'—'}</span>}
          <small>{coverageLabel}</small>
        </div>
        {indicative&&view?.price?.reference?<p className="slip-comparison-note">{view.price.reference.bookmakerName} · {view.price.reference.sourceGeo} · {new Date(view.price.reference.observedAt).toISOString().slice(11,16)} UTC<br/>{uiLocale==='en'?'Information only — not an executable bookmaker offer.':uiLocale==='br'?'Somente informação — não é uma oferta de aposta.':'Solo información — no es una oferta ejecutable.'}<br/><small>{view.price.reference.quoteId}</small></p>:null}
        {view?.state==='PRICE_CHANGED'&&view.previousDecimalOdds&&view.price&&formatSlipOdds(view.previousDecimalOdds,uiLocale)&&price?
          <p className="slip-reprice"><ApproximatePrice value={formatSlipOdds(view.previousDecimalOdds,uiLocale)!} label={approximateLabel}/> → <ApproximatePrice value={price} label={approximateLabel}/></p>:null}
        {view?.state!=='CURRENT'||missing.length?<div className={`slip-state${missing.length?' is-partial':''}`}>
          <span>{missing.length||(view&&view.state!=='CURRENT')?'! ':view?.state==='CURRENT'?'✓ ':''}{status}</span>
        </div>:null}
        {missing.length>1?<ul className="slip-leg-missing">{missing.map(q=>q.quote?
          <li key={q.id}>{missingLegReason(q.quote,q.name,uiLocale)}</li>:null)}</ul>:null}
      </li>;
    })}
  </ol>;
}
