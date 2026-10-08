import {describe,it,expect} from 'vitest';
import {currentReferences,unavailableOddsLabel} from './display';
import type {IndicativeQuote} from './types';
describe('reference display expiry',()=>{
 const q={kind:'INDICATIVE',executable:false,affiliateEligible:false,decimalOdds:'1.9',expiresAt:'2026-10-09T00:00:00Z'} as IndicativeQuote;
 it('uses the same live coverage predicate for parent placeholders and reference content',()=>{
  expect(currentReferences([q],Date.parse(q.expiresAt)-1)).toEqual([q]);
  expect(currentReferences([q],Date.parse(q.expiresAt))).toEqual([]);
  expect(currentReferences([q],Infinity)).toEqual([]);
  expect(currentReferences([{...q,decimalOdds:'NaN'}],0)).toEqual([]);
  expect(currentReferences(undefined,0)).toEqual([]);
 });
 it('has an explicit compact unavailable label in every interface language',()=>{
  for(const locale of ['mx','co','pe'])expect(unavailableOddsLabel(locale)).toBe('Cuota no disponible');
 });
});
