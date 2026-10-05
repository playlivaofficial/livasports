import {describe,it,expect} from 'vitest';
import {guardResolved,markPriceChange,resolveSelection,type SlipFixtureRead} from './resolution';
import {SLIP_SCOPE,type CanonicalSelection} from './types';
import {freshnessTtlMs} from '@/odds/scheduler-policy';
import type {ReadOddsQuote} from '@/odds/types';
const now=Date.parse('2026-09-12T18:00:00Z');
export const testPick:CanonicalSelection={fixturePublicId:'1111111111111111',scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null};
const quote:ReadOddsQuote={quoteId:'quote-test',fixtureId:'test',providerFixtureId:'test-provider',bookmaker:'betsson',bookmakerId:'test-book',bookmakerName:'Betsson',market:'MATCH_WINNER',outcome:'HOME',line:null,
  decimalOdds:'2.12345678',status:'ACTIVE',scope:SLIP_SCOPE,phase:'PREGAME',providerUpdatedAt:'2026-09-12T17:59:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),
  providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betsson.com',geoEligible:true};
export const testRead:SlipFixtureRead={fixture:{publicId:testPick.fixturePublicId,home:'Test Home',away:'Test Away',competition:'Test Competition',kickoff:quote.providerKickoff,status:'SCHEDULED'},snapshot:{quotes:[quote],kickoff:quote.providerKickoff,fixtureStatus:'SCHEDULED'}};
describe('current reference, not a frozen bet',()=>{
  it('retains precision, single price without best, no combined product/CTA/provider identifiers',()=>{
    const result=resolveSelection(testPick,testRead,now);expect(result.state).toBe('CURRENT');expect(result.price?.decimalOdds).toBe('2.12345678');expect(result.price?.best).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/providerFixtureId|sourceDomain|destination|combined/);
  });
  it('chooses exact highest reference only when M5 has two genuinely eligible prices',()=>{
    const read={...testRead,snapshot:{...testRead.snapshot,quotes:[quote,{...quote,quoteId:'quote-bwin',bookmaker:'bwin',bookmakerName:'Test second book',decimalOdds:'2.50'}]}};
    // Two genuinely eligible public books, so the higher reference is marked best.
    expect(resolveSelection(testPick,read,now).price).toMatchObject({best:true,decimalOdds:'2.50',bookmaker:'bwin'});
    read.snapshot.quotes[1].geoEligible=false;expect(resolveSelection(testPick,read,now).price?.best).toBe(false);
  });
  it.each(['STALE','SUSPENDED','CLOSED'] as const)('preserves %s intent but no price',status=>{
    const result=resolveSelection(testPick,{...testRead,snapshot:{...testRead.snapshot,quotes:[{...quote,status}]}},now);
    expect(result.state).toBe(status);expect(result.price).toBeNull();expect(result.selection).toEqual(testPick);
  });
  it('expires at the one-feed cadence plus one tick, even in an open or offline page',()=>{
    const result=resolveSelection(testPick,testRead,now);const ttl=freshnessTtlMs(1,1);
    expect(resolveSelection(testPick,testRead,now+ttl).state).toBe('STALE');
    expect(guardResolved(result,now+ttl).price).toBeNull();expect(guardResolved(result,now,false).price).toBeNull();
  });
  it('never renders a price on an inconsistent unavailable response or an invalid decimal',()=>{
    const value=resolveSelection(testPick,testRead,now);
    for(const state of ['SUSPENDED','CLOSED','STALE','UNAVAILABLE','MATCH_STARTED','MATCH_FINISHED'] as const)expect(guardResolved({...value,state},now).price).toBeNull();
    expect(guardResolved({...value,price:{...value.price!,decimalOdds:'NaN'}},now).price).toBeNull();
  });
  it.each([['LIVE','MATCH_STARTED'],['HALFTIME','MATCH_STARTED'],['FINISHED','MATCH_FINISHED'],['CANCELLED','CLOSED'],['POSTPONED','CLOSED']])('reports %s truthfully', (status,state)=>{
    const result=resolveSelection(testPick,{...testRead,fixture:{...testRead.fixture,status},snapshot:{...testRead.snapshot,fixtureStatus:status}},now);
    expect(result.state).toBe(state);expect(result.price).toBeNull();
  });
  it('closes at canonical kickoff even if persisted status still says scheduled',()=>{
    expect(resolveSelection(testPick,testRead,Date.parse(quote.providerKickoff)).state).toBe('MATCH_STARTED');
    expect(guardResolved(resolveSelection(testPick,testRead,now),Date.parse(quote.providerKickoff)).state).toBe('MATCH_STARTED');
    expect(guardResolved({...resolveSelection(testPick,testRead,now),state:'STALE',price:null},Date.parse(quote.providerKickoff)).state).toBe('MATCH_STARTED');
  });
  it('keeps missing fixtures and rescheduled canonical identity without using a stale mapping',()=>{
    expect(resolveSelection(testPick,null,now)).toMatchObject({selection:testPick,reason:'MISSING_FIXTURE',price:null});
    const kickoff='2026-09-13T19:00:00Z';const changed={...testRead,fixture:{...testRead.fixture,kickoff},snapshot:{...testRead.snapshot,kickoff}};
    const result=resolveSelection(testPick,changed,now);expect(result.selection).toEqual(testPick);expect(result.fixture?.kickoff).toBe(kickoff);expect(result.price).toBeNull();
  });
  it('hides unverified locale quotes while keeping the BR-created intent',()=>{
    const result=resolveSelection(testPick,{...testRead,snapshot:{...testRead.snapshot,quotes:[{...quote,geoEligible:false}]}},now);
    expect(result).toMatchObject({selection:testPick,state:'UNAVAILABLE',reason:'NO_VERIFIED_GEO',price:null});
  });
  it('does not substitute another outcome or total line',()=>{
    expect(resolveSelection({...testPick,outcome:'DRAW'},testRead,now).price).toBeNull();
    expect(resolveSelection({...testPick,market:'TOTAL_GOALS',outcome:'OVER',line:2.5},{...testRead,snapshot:{...testRead.snapshot,quotes:[{...quote,market:'TOTAL_GOALS',outcome:'OVER',line:3.5}]}},now).price).toBeNull();
  });
  it('marks an observed price change, not initial restoration or formatting, and never revives expiry',()=>{
    const value=resolveSelection(testPick,testRead,now);
    expect(markPriceChange(value,undefined).state).toBe('CURRENT');expect(markPriceChange(value,'2.123456780').state).toBe('CURRENT');
    expect(markPriceChange(value,'2.5').state).toBe('PRICE_CHANGED');
    expect(guardResolved(markPriceChange(value,'2.5'),now+freshnessTtlMs(1,1)).price).toBeNull();
    expect(markPriceChange({...value,price:null,state:'SUSPENDED'},'2.5').state).toBe('SUSPENDED');
  });
});
