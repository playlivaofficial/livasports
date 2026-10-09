'use client';
import type {SiteLocale} from '@/config/i18n';
import {emitProductEvent} from '@/components/match/events';
import {canonicalSelection,selectionKey,type CanonicalSelection} from './types';
export type SlipEventName='slip_open'|'slip_selection_add'|'slip_selection_replace'|'slip_selection_remove'|'slip_clear'|'slip_state_invalidated';
export interface SlipPriceContext {targetBookmaker:string;priceKind:'REAL'|'PROXY';decimalOdds?:string;}
export function emitSlipEvent(eventName:SlipEventName,locale:SiteLocale,selection?:CanonicalSelection,bookmaker?:string,analytics:{legCount?:number;priceKind?:'REAL'|'PROXY'}={}){
  // Callers hold stored selections (they carry addedAt); the events API only accepts a strictly canonical one.
  const canonical=selection?canonicalSelection(selection):null;
  emitProductEvent({eventName,locale,placement:'guest-slip',...(canonical?{selection:canonical}:{}),...(bookmaker?{bookmaker}:{})},
    `slip:${eventName}:${locale}:${selection?selectionKey(selection):'all'}`,analytics);
}
