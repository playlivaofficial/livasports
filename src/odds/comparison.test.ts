import {describe,it,expect} from 'vitest';
import {buildComparison,quoteState} from './comparison';
import {ODDS_TTL_MS,type OddsReadSnapshot,type ReadOddsQuote} from './types';
const now=Date.parse('2026-09-12T18:00:00Z');
const q:ReadOddsQuote={fixtureId:'f',providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.12345678',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true};
const snapshot:OddsReadSnapshot={quotes:[q],kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED'};
describe('exact selection comparison',()=>{
  it('preserves precision and never marks one bookmaker best',()=>{
    const c=buildComparison(snapshot,'MATCH_WINNER',now);expect(c.rows[0].cells[0].decimalOdds).toBe('2.12345678');expect(c.rows[0].cells[0].best).toBe(false);expect(c.rows[0].cells[1].decimalOdds).toBe(null);
  });
  it('compares exact outcomes only, with ties across genuinely eligible books',()=>{
    const c=buildComparison({...snapshot,quotes:[q,{...q,bookmaker:'betsson'}]},'MATCH_WINNER',now);
    expect(c.rows.every(r=>r.cells[0].best)).toBe(true);
    expect(c.rows.every(r=>!r.cells[1].best)).toBe(true);
  });
  it.each(['SUSPENDED','STALE','CLOSED'] as const)('does not compare %s prices',status=>{
    const c=buildComparison({...snapshot,quotes:[q,{...q,bookmaker:'betsson',status}]},'MATCH_WINNER',now);
    expect(c.rows[0].cells[0].best).toBe(false);expect(c.eligiblePrices).toBe(1);
  });
  it('excludes GEO-unverified or Mexico-ineligible prices',()=>{
    expect(buildComparison({...snapshot,quotes:[{...q,geoEligible:false}]},'MATCH_WINNER',now).rows).toHaveLength(0);
  });
  it('expires using observation, not last price-change or page-read time',()=>{
    expect(quoteState(q,snapshot,now)).toBe('ACTIVE');
    expect(quoteState(q,snapshot,now+ODDS_TTL_MS)).toBe('STALE');
    expect(quoteState({...q,providerUpdatedAt:null},snapshot,now)).toBe('STALE');
    expect(quoteState({...q,observedAt:'2026-09-12T20:00:00Z'},snapshot,now)).toBe('STALE');
  });
  it.each(['LIVE','FINISHED','HALFTIME','CANCELLED','POSTPONED','ABANDONED'])('disables pregame for %s',fixtureStatus=>{
    expect(quoteState(q,{...snapshot,fixtureStatus},now)).toBe('CLOSED');
  });
  it('disables at either provider kickoff and rejects changed kickoff mappings',()=>{
    expect(buildComparison(snapshot,'MATCH_WINNER',now).closesAt).toBe('2026-09-12T19:00:00.000Z');
    expect(quoteState(q,snapshot,Date.parse(q.providerKickoff))).toBe('CLOSED');
    expect(quoteState(q,{...snapshot,kickoff:'2026-09-12T23:00:00Z'},now)).toBe('CLOSED');
  });
  it('never equates differing lines/periods or duplicate selection rows',()=>{
    expect(buildComparison({...snapshot,quotes:[{...q,market:'TOTAL_GOALS',outcome:'OVER',line:3.5}]},'TOTAL_GOALS',now).rows).toHaveLength(0);
    expect(buildComparison({...snapshot,quotes:[q,q]},'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });
});
