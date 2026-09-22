import {describe,it,expect} from 'vitest';
import {classifyNativeSourceQuote,validateNativeSourceBatch,type NativeSourceQuote} from '@/providers/contracts/NativeOddsSource';
const base:NativeSourceQuote={sourceProvider:'oddspapi',fixture:{providerFixtureId:'pf',canonicalFixtureId:'11111111-1111-4111-8111-111111111111',mappingVerified:true},bookmaker:'betsson',providerBookmakerId:'betsson',
  market:'MATCH_WINNER',providerMarketId:'1x2',outcome:'HOME',line:null,decimalOdds:'2.20',status:'ACTIVE',providerUpdatedAt:'2026-09-21T14:00:00Z',observedAt:'2026-09-21T14:15:14Z',providerKickoff:'2026-09-21T19:00:00Z',freshnessTtlMinutes:60,sourceDomain:'betsson.com',confidence:'VERIFIED'};
describe('native source quote validation (production stall 2026-09-21: one bad quote failed every tick)',()=>{
  it('accepts a fresh verified pregame quote',()=>{expect(classifyNativeSourceQuote(base,'oddspapi')).toBeNull();});
  it('rejects unverified identity (unverified mapping, missing canonical fixture, missing bookmaker id, foreign provider)',()=>{
    expect(classifyNativeSourceQuote({...base,fixture:{...base.fixture,mappingVerified:false}},'oddspapi')).toBe('UNVERIFIED_NATIVE_SOURCE_IDENTITY');
    expect(classifyNativeSourceQuote({...base,fixture:{...base.fixture,canonicalFixtureId:''}},'oddspapi')).toBe('UNVERIFIED_NATIVE_SOURCE_IDENTITY');
    expect(classifyNativeSourceQuote({...base,providerBookmakerId:''},'oddspapi')).toBe('UNVERIFIED_NATIVE_SOURCE_IDENTITY');
    expect(classifyNativeSourceQuote(base,'other')).toBe('UNVERIFIED_NATIVE_SOURCE_IDENTITY');
  });
  it('rejects invalid prices, unparsable timestamps and expired (started fixture) quotes as INVALID, not fatal',()=>{
    expect(classifyNativeSourceQuote({...base,decimalOdds:'1.00'},'oddspapi')).toBe('INVALID_NATIVE_SOURCE_QUOTE');
    expect(classifyNativeSourceQuote({...base,decimalOdds:'abc'},'oddspapi')).toBe('INVALID_NATIVE_SOURCE_QUOTE');
    expect(classifyNativeSourceQuote({...base,observedAt:'not-a-date'},'oddspapi')).toBe('INVALID_NATIVE_SOURCE_QUOTE');
    expect(classifyNativeSourceQuote({...base,freshnessTtlMinutes:0},'oddspapi')).toBe('INVALID_NATIVE_SOURCE_QUOTE');
    expect(classifyNativeSourceQuote({...base,freshnessTtlMinutes:-5},'oddspapi')).toBe('INVALID_NATIVE_SOURCE_QUOTE');
  });
  it('keeps the valid quotes of a batch and reports the rejected ones with reasons',()=>{
    const {batch,rejected}=validateNativeSourceBatch({sourceProvider:'oddspapi',observedAt:base.observedAt,requestCount:1,quotes:[base,{...base,outcome:'AWAY',freshnessTtlMinutes:0},{...base,outcome:'DRAW',fixture:{...base.fixture,mappingVerified:false}}]});
    expect(batch.quotes.map(q=>q.outcome)).toEqual(['HOME']);
    expect(rejected.map(r=>[r.quote.outcome,r.reason])).toEqual([['AWAY','INVALID_NATIVE_SOURCE_QUOTE'],['DRAW','UNVERIFIED_NATIVE_SOURCE_IDENTITY']]);
  });
  it('is fatal only for a malformed batch envelope',()=>{
    expect(()=>validateNativeSourceBatch({sourceProvider:'',observedAt:base.observedAt,requestCount:1,quotes:[]})).toThrow('INVALID_NATIVE_SOURCE_BATCH');
    expect(()=>validateNativeSourceBatch({sourceProvider:'oddspapi',observedAt:base.observedAt,requestCount:-1,quotes:[]})).toThrow('INVALID_NATIVE_SOURCE_BATCH');
  });
});
