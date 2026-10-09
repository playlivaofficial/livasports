import {describe,it,expect} from 'vitest';
import {currentReferences,unavailableOddsLabel,referencesForGaps} from './display';
import type {IndicativeQuote} from './types';
const now=Date.parse('2026-10-09T10:00:00Z');
const reference:IndicativeQuote={kind:'INDICATIVE',fixtureId:'fixture',providerFixtureId:'provider',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION',phase:'PREGAME',decimalOdds:'2.15',bookmaker:'bwin',bookmakerName:'bwin',sourceGeo:'CO',sourceDomain:'sports.bwin.com',quoteId:'ref',observedAt:'2026-10-09T09:00:00Z',providerUpdatedAt:'2026-10-09T09:00:00Z',expiresAt:'2026-10-09T11:00:00Z',affiliateEligible:false,executable:false};
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
describe('compact exact-outcome reference gaps',()=>{
 it('suppresses cached duplicates only for outcomes genuinely covered locally',()=>{
  const refs=(['HOME','DRAW','AWAY'] as const).map(outcome=>({...reference,outcome}));
  expect(referencesForGaps(refs,now,'MATCH_WINNER',null,['HOME']).map(q=>q.outcome)).toEqual(['DRAW','AWAY']);
  expect(referencesForGaps(refs,now,'MATCH_WINNER',null,['HOME','DRAW','AWAY'])).toEqual([]);
 });
 it('deduplicates informational sources without manufacturing a local offer',()=>{
  expect(referencesForGaps([reference,reference],now,'MATCH_WINNER',null,[])).toEqual([reference]);
 });
 it('requires the exact market and line',()=>{
  expect(referencesForGaps([reference],now,'BTTS',null,[])).toEqual([]);
  const over={...reference,market:'TOTAL_GOALS' as const,outcome:'OVER' as const,line:2.5};
  expect(referencesForGaps([over],now,'TOTAL_GOALS',3.5,[])).toEqual([]);
  expect(referencesForGaps([over],now,'TOTAL_GOALS',2.5,[])).toEqual([over]);
 });
 it.each([{expiresAt:new Date(now).toISOString()},{decimalOdds:'0'},{decimalOdds:'1001'},{decimalOdds:'NaN'},{executable:true},{affiliateEligible:true},{scope:'EXTRA_TIME'},{phase:'LIVE'}])('rejects unsafe reference %j',override=>{
  expect(referencesForGaps([{...reference,...override} as IndicativeQuote],now,'MATCH_WINNER',null,[])).toEqual([]);
 });
});
