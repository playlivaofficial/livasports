'use client';
import {useEffect,useState} from 'react';
import type {CommercialContext,PublicOffer} from './types';
interface Pending {context:CommercialContext;resolve:(offer:PublicOffer|null)=>void;}
const pending:Pending[]=[];let scheduled=false;
async function flush(){scheduled=false;const items=pending.splice(0,16);if(pending.length)schedule();
  try{const r=await fetch('/api/commercial/offers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(items.map(i=>i.context)),signal:AbortSignal.timeout(5000),cache:'no-store'});
    const body=await r.json();if(!r.ok||!Array.isArray(body.offers)||body.offers.length!==items.length)throw Error('INVALID_OFFERS');items.forEach((item,i)=>item.resolve(body.offers[i]));
  }catch{items.forEach(item=>item.resolve(null));}
}
function schedule(){if(!scheduled){scheduled=true;queueMicrotask(()=>void flush());}}
function requestOffer(context:CommercialContext){return new Promise<PublicOffer|null>(resolve=>{pending.push({context,resolve});schedule();});}
export function useCommercialOffer(context:CommercialContext,enabled=true){
  const signature=JSON.stringify(context);const [value,setValue]=useState<{signature:string;offer:PublicOffer|null;received:number}|null>(null),[refresh,setRefresh]=useState(0);
  useEffect(()=>{if(!enabled)return;let stopped=false;void requestOffer(JSON.parse(signature)).then(offer=>{if(!stopped)setValue({signature,offer,received:performance.now()});});return()=>{stopped=true;};},[signature,refresh,enabled]);
  const current=value?.signature===signature?value:null;
  useEffect(()=>{if(!current?.offer)return;const deadline=Date.parse(current.offer.expiresAt),server=Date.parse(current.offer.resolvedAt);
    const remaining=deadline-Math.max(Date.now(),server+performance.now()-current.received);
    const expire=setTimeout(()=>setValue(v=>v===current?{...v,offer:null}:v),Math.max(1,remaining));
    // Renew only long-lived eligible offers. Expiring quotes never cause a poll loop.
    const renew=remaining>15000?setTimeout(()=>{if(document.visibilityState==='visible')setRefresh(v=>v+1);},remaining-5000):null;
    return()=>{clearTimeout(expire);if(renew)clearTimeout(renew);};
  },[current]);
  return enabled?current?.offer??null:null;
}
export function privacyOptOut(){return navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true;}
export function qaBrowser(){return navigator.webdriver===true;}
