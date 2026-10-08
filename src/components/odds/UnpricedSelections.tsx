'use client';
import {useEffect,useState} from 'react';
import type {SiteLocale} from '@/config/i18n';
import {SELECTIONS,type OddsMarket} from '@/odds/types';
import {addSlipSelection,useSlip} from '@/slip/client';
import {canonicalSelection,selectionKey,SLIP_SCOPE} from '@/slip/types';
import {selectionLabel,type SlipUiLocale} from '@/slip/localization';
/** Save intent without inventing a price. Kickoff is an intent deadline, not quote freshness. */
export function UnpricedSelections({fixturePublicId,kickoff,market='MATCH_WINNER',locale,uiLocale}:{fixturePublicId?:string;kickoff?:string|null;market?:OddsMarket;locale?:SiteLocale|null;uiLocale:SlipUiLocale}){
 const saved=useSlip();const [now,setNow]=useState(0);
 useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[]);
 if(!now||!locale||!kickoff||!Number.isFinite(Date.parse(kickoff))||Date.parse(kickoff)<=now)return null;
 const label=uiLocale==='en'?'Save without odds':uiLocale==='br'?'Salvar sem cotação':'Guardar sin cuota';
 return <details className="unpriced-selections"><summary>{label}</summary><div className="unpriced-selections-options">{SELECTIONS[market].map(outcome=>{
  const intent=canonicalSelection({fixturePublicId,scope:SLIP_SCOPE,market,outcome,line:market==='TOTAL_GOALS'?2.5:null});if(!intent)return null;
  const pressed=saved.slip.selections.some(s=>selectionKey(s)===selectionKey(intent));
  return <button key={outcome} type="button" disabled={!saved.ready} aria-pressed={pressed} aria-label={`${label}: ${selectionLabel(intent,uiLocale)}`}
   onClick={e=>{e.preventDefault();e.stopPropagation();addSlipSelection(intent,locale,kickoff);}}>{selectionLabel(intent,uiLocale)} {pressed?'✓':'+'}</button>;
 })}</div></details>;
}
