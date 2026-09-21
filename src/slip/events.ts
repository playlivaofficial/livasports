'use client';
import type {SiteLocale} from '@/config/i18n';
import {emitProductEvent} from '@/components/match/events';
import {selectionKey,type CanonicalSelection} from './types';
export type SlipEventName='slip_open'|'slip_selection_add'|'slip_selection_replace'|'slip_selection_remove'|'slip_clear'|'slip_state_invalidated';
export interface SlipPriceContext {targetBookmaker:string;priceKind:'REAL'|'PROXY';}
export function emitSlipEvent(eventName:SlipEventName,locale:SiteLocale,selection?:CanonicalSelection,bookmaker?:string,analytics:{legCount?:number;priceKind?:'REAL'|'PROXY'}={}){
  emitProductEvent({eventName,locale,placement:'guest-slip',...(selection?{selection}:{}),...(bookmaker?{bookmaker}:{})},
    `slip:${eventName}:${locale}:${selection?selectionKey(selection):'all'}`,analytics);
}
