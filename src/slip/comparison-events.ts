'use client';
import {emitProductEvent} from '@/components/match/events';
import type {SiteLocale} from '@/config/i18n';
import type {BookmakerSlip} from './comparison-types';
import type {CanonicalSelection} from './types';
export type ComparisonEventName='slip_comparison_view'|'slip_bookmaker_complete'|'slip_bookmaker_partial'|'slip_best_price_view'|'slip_bookmaker_click';
export function emitComparisonEvent(eventName:ComparisonEventName,locale:SiteLocale,selections:CanonicalSelection[],bookmaker?:BookmakerSlip){
  const marketsSummary=Object.fromEntries(['MATCH_WINNER','TOTAL_GOALS','BTTS'].map(m=>[m,selections.filter(s=>s.market===m).length]));
  const props={eventName,locale,placement:'slip-comparison',selectionCount:selections.length,marketsSummary,
    ...(bookmaker?{bookmaker:bookmaker.bookmakerId,availableCount:bookmaker.availableSelectionCount,complete:bookmaker.complete}:{})};
  emitProductEvent(props,`m7:${eventName}:${locale}:${selections.length}:${JSON.stringify(marketsSummary)}:${bookmaker?.bookmakerId??'all'}:${bookmaker?.availableSelectionCount??''}`);
}
