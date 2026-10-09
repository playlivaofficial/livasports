'use client';
import {useEffect,useState} from 'react';
import type {SiteLocale} from '@/config/i18n';
import {guardResolved,markPriceChange} from './resolution';
import {canonicalSelection,wireSelection,selectionKey,type SavedSelection,type SlipResolution,type ResolvedSelection} from './types';
import {emitSlipEvent} from './events';
import type {FullSlipResolution} from './comparison-types';
import {guardSlipComparison,enforceSelectionLocks} from './comparison';
import {validComparisonResponse} from './comparison-response';

// Session-only observations; the accepted quote lives in its server-signed receipt, not canonical identity.
const observations=new Map<string,{price:string;from?:string;changed:boolean;valid:boolean}>();
export function useSlipResolution(selections:SavedSelection[],locale:SiteLocale){
  const signature=JSON.stringify({locale,selections:selections.map(wireSelection)});
  const [data,setData]=useState<{signature:string;body:SlipResolution&Partial<Pick<FullSlipResolution,'comparison'>>;received:number}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  const [online,setOnline]=useState(true);
  const [clock,setClock]=useState({wall:0,mono:0});
  useEffect(()=>{
    let stopped=false;let busy=false;let lastAttempt=0;let active:AbortController|null=null;
    const input=JSON.parse(signature) as {locale:SiteLocale;selections:SavedSelection[]};
    if(!input.selections.length){
      observations.clear();
      queueMicrotask(()=>{if(!stopped){setData(null);setFailure(null);}});
      return()=>{stopped=true;};
    }
    const tick=()=>{if(!stopped&&document.visibilityState==='visible')setClock({wall:Date.now(),mono:performance.now()});};
    async function refresh(){
      if(stopped||busy||!input.selections.length||!navigator.onLine||document.visibilityState!=='visible'||Date.now()-lastAttempt<15000)return;
      busy=true;lastAttempt=Date.now();active=new AbortController();const timeout=setTimeout(()=>active?.abort(),10000);
      try{
        const response=await fetch('/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:signature,cache:'no-store',signal:active.signal});
        if(!response.ok)throw new Error('READ_FAILED');
        const body=await response.json() as FullSlipResolution;
        if(body.locale!==input.locale||body.providerRequests!==0||!Array.isArray(body.selections)||body.selections.length!==input.selections.length||
          !Number.isFinite(Date.parse(body.resolvedAt))||body.selections.some((s,i)=>!canonicalSelection(s.selection,true)||selectionKey(s.selection)!==selectionKey(input.selections[i])))throw new Error('INVALID_RESPONSE');
        if(body.comparison&&!validComparisonResponse(body.comparison,input.locale,input.selections))throw new Error('INVALID_COMPARISON');
        if(stopped)return;
        body.selections=body.selections.map(value=>{
          const key=`${input.locale}:${selectionKey(value.selection)}:${input.selections.find(s=>selectionKey(s)===selectionKey(value.selection))?.receipt??'unbound'}`;const previous=observations.get(key);
          let next=markPriceChange(value,previous?.price);
          if(next.price){const price=next.price.decimalOdds;if(previous?.changed)next={...next,state:'PRICE_CHANGED',previousDecimalOdds:previous.from??previous.price};
            observations.set(key,{price,from:next.previousDecimalOdds??previous?.from??previous?.price,changed:next.state==='PRICE_CHANGED',valid:true});
          }else if(previous?.valid){observations.set(key,{...previous,valid:false});emitSlipEvent('slip_state_invalidated',input.locale,value.selection);}
          return next;
        });
        while(observations.size>128)observations.delete(observations.keys().next().value!);
        tick();setData({signature,body,received:performance.now()});setFailure(null);
      }catch{if(!stopped)setFailure(signature);}finally{clearTimeout(timeout);busy=false;}
    }
    const visibility=()=>{tick();void refresh();};
    const connection=()=>{setOnline(navigator.onLine);if(!navigator.onLine){active?.abort();setFailure(signature);}else void refresh();};
    queueMicrotask(()=>{if(!stopped){connection();tick();}});
    const timer=setInterval(tick,1000);const poll=setInterval(()=>void refresh(),60000);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('pageshow',visibility);
    return()=>{stopped=true;active?.abort();clearInterval(timer);clearInterval(poll);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('pageshow',visibility);};
  },[signature]);
  const current=data?.signature===signature?data:null;
  const failed=failure===signature;
  const now=current?Math.max(clock.wall,Date.parse(current.body.resolvedAt)+Math.max(0,clock.mono-current.received)):clock.wall;
  const deadlines=current?[...current.body.selections.flatMap(v=>[v.closesAt,v.price?.expiresAt]),
    ...(current.body.comparison?.bookmakers.flatMap(b=>b.selectionQuotes.flatMap(q=>[q.closesAt,q.expiresAt]))??[])]
    .filter((v):v is string=>typeof v==='string').map(Date.parse).filter(v=>Number.isFinite(v)&&v>now):[];
  const deadline=deadlines.length?Math.min(...deadlines):null;
  useEffect(()=>{
    if(deadline===null)return;
    // Wake at the exact known boundary as well as ticking/polling; hidden tabs recheck on visibility.
    const timer=setTimeout(()=>setClock({wall:Date.now(),mono:performance.now()}),Math.min(2147483647,Math.max(1,deadline-now+1)));
    return()=>clearTimeout(timer);
  },[deadline,now]);
  const resolved=current?.body.selections.map(v=>guardResolved(v,now,online&&!failed))??[];
  const invalidSignature=JSON.stringify(resolved.filter(v=>!v.price).map(v=>v.selection));
  useEffect(()=>{
    for(const selection of JSON.parse(invalidSignature) as SavedSelection[]){const key=`${locale}:${selectionKey(selection)}:${selections.find(s=>selectionKey(s)===selectionKey(selection))?.receipt??'unbound'}`;const previous=observations.get(key);
      if(previous?.valid){observations.set(key,{...previous,valid:false});emitSlipEvent('slip_state_invalidated',locale,selection);}
    }
  },[invalidSignature,locale,selections]);
  const comparison=current?.body.comparison?enforceSelectionLocks(guardSlipComparison(current.body.comparison,selections.length,now,online&&!failed),resolved):null;
  return {resolved,comparison,failed,online,checking:selections.length>0&&!current&&!failed,resolvedAt:current?.body.resolvedAt??null,now};
}

export function resolvedByKey(values:ResolvedSelection[]){return new Map(values.map(v=>[selectionKey(v.selection),v]));}
