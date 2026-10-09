'use client';
import {useSyncExternalStore} from 'react';
import type {SiteLocale} from '@/config/i18n';
import {createSlipStore,EMPTY_SLIP,type StorageNotice} from './state';
import {canonicalSelection,receiptDisplay,selectionKey,marketKey,type CanonicalSelection,type SavedSelection,type BoundSelection} from './types';
import {emitSlipEvent} from './events';
import type {SlipPriceContext} from './events';
import {track} from '@/analytics/client';

export const slipStore=createSlipStore(()=>window.localStorage);
const serverSnapshot={slip:EMPTY_SLIP,notice:null as StorageNotice,ready:false};
export function useSlip(){return useSyncExternalStore(slipStore.subscribe,slipStore.getSnapshot,()=>serverSnapshot);}
export interface SlipFeedback {result:string;selection?:CanonicalSelection;expiresAt?:string;bookmaker?:string;priceContext?:SlipPriceContext;expectedKey?:string;}
export const FEEDBACK_EVENT='livasports:slip-feedback';
export function feedback(value:SlipFeedback){window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT,{detail:value}));}
const pending=new Set<string>();
export async function addSlipSelection(value:CanonicalSelection,locale:SiteLocale,expiresAt:string,bookmaker?:string,priceContext?:SlipPriceContext,confirm?:SavedSelection){
  const selection=canonicalSelection(value);
  if(!selection||!bookmaker||priceContext?.priceKind!=='REAL'||!Number.isFinite(Number(priceContext.decimalOdds))||Number(priceContext.decimalOdds)<=1||Number(priceContext.decimalOdds)>1000||!Number.isFinite(Date.parse(expiresAt))||Date.now()>=Date.parse(expiresAt)){feedback({result:'EXPIRED'});return;}
  const key=marketKey(selection);if(pending.has(key))return;
  slipStore.reload();const before=slipStore.getSnapshot().slip;
  const revision=slipStore.getRevision(key);
  // Removal requires no price and cannot race a pending add back into the slip.
  const existing=before.selections.find(s=>selectionKey(s)===selectionKey(selection));
  const display=existing?receiptDisplay(existing):null;
  if(existing&&!confirm&&display?.book===bookmaker&&Number(display.price)===Number(priceContext.decimalOdds)&&display.expires>Date.now()){
    const result=slipStore.dispatch({type:'remove',key:selectionKey(selection)});feedback({result:result.result});return;
  }
  if(existing&&!confirm)confirm=existing;
  pending.add(key);const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
  try{
  const response=await fetch('/api/slip/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale,selection,bookmaker,decimalOdds:priceContext.decimalOdds}),cache:'no-store',signal:abort.signal});
  if(!response.ok){feedback({result:'EXPIRED'});return;}
  const body=await response.json() as {selection:BoundSelection;price:{bookmaker:string;decimalOdds:string;expiresAt:string};providerRequests:number};
  if(body.providerRequests!==0||!canonicalSelection(body.selection)||selectionKey(body.selection)!==selectionKey(selection)||!body.selection.receipt||!body.price||body.price.bookmaker!==bookmaker||Number(body.price.decimalOdds)!==Number(priceContext.decimalOdds)||!Number.isFinite(Date.parse(body.price.expiresAt))||Date.now()>=Date.parse(body.price.expiresAt)||Date.now()>=Date.parse(expiresAt)){feedback({result:'EXPIRED'});return;}
  slipStore.reload();
  // A clear/remove/replacement/other-tab write during admission must never be undone.
  if(slipStore.getRevision(key)!==revision){feedback({result:'EXPIRED'});return;}
  const result=slipStore.dispatch(confirm?{type:'confirm',selection:body.selection,addedAt:new Date().toISOString(),expectedReceipt:confirm.receipt}:{type:'add',selection:body.selection,addedAt:new Date().toISOString()});
  const analytics={legCount:result.slip.selections.length,priceKind:priceContext?.priceKind};
  if(result.result==='ADDED')emitSlipEvent('slip_selection_add',locale,selection,bookmaker,analytics);
  if(result.result==='REPLACED')emitSlipEvent('slip_selection_replace',locale,selection,bookmaker,analytics);
  if(result.result==='REMOVED')emitSlipEvent('slip_selection_remove',locale,selection,undefined,analytics);
  feedback({result:result.result,selection,expiresAt,bookmaker,priceContext,expectedKey:selectionKey(selection)});
  }catch{feedback({result:'EXPIRED'});}finally{clearTimeout(timeout);pending.delete(key);}
}
export function setSlipStake(stake:string){
  const result=slipStore.dispatch({type:'setStake',stake});
  if(result.result==='INVALID_STAKE')feedback({result:'INVALID_STAKE'});
  else track('stake_changed',{slipLegCount:result.slip.selections.length},{dedupeKey:`stake:${Date.now()>>14}`});
}
