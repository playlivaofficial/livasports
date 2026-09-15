'use client';
import {useSyncExternalStore} from 'react';
import type {SiteLocale} from '@/config/i18n';
import {createSlipStore,EMPTY_SLIP,type StorageNotice} from './state';
import {canonicalSelection,selectionKey,type CanonicalSelection} from './types';
import {emitSlipEvent} from './events';
import type {SlipPriceContext} from './events';

export const slipStore=createSlipStore(()=>window.localStorage);
const serverSnapshot={slip:EMPTY_SLIP,notice:null as StorageNotice,ready:false};
export function useSlip(){return useSyncExternalStore(slipStore.subscribe,slipStore.getSnapshot,()=>serverSnapshot);}
export interface SlipFeedback {result:string;selection?:CanonicalSelection;expiresAt?:string;bookmaker?:string;priceContext?:SlipPriceContext;expectedKey?:string;}
export const FEEDBACK_EVENT='livasports:slip-feedback';
export function feedback(value:SlipFeedback){window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT,{detail:value}));}
export function addSlipSelection(value:CanonicalSelection,locale:SiteLocale,expiresAt:string,bookmaker?:string,priceContext?:SlipPriceContext){
  const selection=canonicalSelection(value);
  if(!selection||!Number.isFinite(Date.parse(expiresAt))||Date.now()>=Date.parse(expiresAt)){feedback({result:'EXPIRED'});return;}
  const result=slipStore.dispatch({type:'add',selection,addedAt:new Date().toISOString()});
  if(result.result==='ADDED')emitSlipEvent('slip_selection_add',locale,selection,bookmaker);
  if(result.result==='REPLACED')emitSlipEvent('slip_selection_replace',locale,selection,bookmaker);
  if(result.result==='REMOVED')emitSlipEvent('slip_selection_remove',locale,selection);
  feedback({result:result.result,selection,expiresAt,bookmaker,priceContext,expectedKey:selectionKey(selection)});
}
export function setSlipStake(stake:string){
  const result=slipStore.dispatch({type:'setStake',stake});
  if(result.result==='INVALID_STAKE')feedback({result:'INVALID_STAKE'});
}
