'use client';
import {useEffect,useState} from 'react';
import type {IndicativeQuote} from '@/odds/types';
import type {SiteLocale} from '@/config/i18n';
import {canonicalSelection} from '@/slip/types';
import {selectionLabel,type SlipUiLocale} from '@/slip/localization';
import {ApproximatePrice} from './ApproximatePrice';
import {currentReferences} from '@/odds/display';

/** No logos, commercial component, destination, or local-availability claim. */
export function ReferenceOdds({quotes,fixturePublicId,uiLocale}:{quotes:readonly IndicativeQuote[];fixturePublicId?:string;locale?:SiteLocale|null;uiLocale:SlipUiLocale}){
 const [now,setNow]=useState(0);
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
 const current=currentReferences(quotes,now||Number.POSITIVE_INFINITY);
 if(!current.length)return null;
 const label=uiLocale==='br'?'Cotação indicativa':uiLocale==='en'?'Indicative odds':'Cuota orientativa';
 const disclaimer=uiLocale==='br'?'Somente informação. Não é uma oferta para apostar.':uiLocale==='en'?'Information only. Not an executable betting offer.':'Solo información. No es una oferta para apostar.';
 return <section className="reference-odds" aria-label={label}>
  <strong>{label}</strong><p>{disclaimer}</p>
  <div className="reference-odds-grid">{current.map(q=>{
   const intent=canonicalSelection({fixturePublicId,scope:q.scope,market:q.market,outcome:q.outcome,line:q.line});
   return <div className="reference-odds-item" key={`${q.market}:${q.outcome}:${q.line}`}>
    {intent?<span>{selectionLabel(intent,uiLocale)}</span>:<span>{q.outcome}</span>}
    <ApproximatePrice value={Number(q.decimalOdds).toFixed(2)} label={label}/>
    <small className="reference-source">REFERENCE · {q.bookmakerName} · {q.sourceGeo}</small>
    <details><summary>{uiLocale==='en'?'Source':'Fuente'}</summary><small>{q.sourceDomain}<br/><time dateTime={q.observedAt}>{new Date(q.observedAt).toISOString().replace('T',' ').slice(0,16)} UTC</time><br/>{q.quoteId}</small></details>
   </div>;
  })}</div>
 </section>;
}
