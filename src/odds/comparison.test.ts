import {describe,it,expect} from 'vitest';
import {buildComparison,quoteState} from './comparison';
import {freshnessTtlMs} from './scheduler-policy';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
const now=Date.parse('2026-09-12T18:00:00Z');
const q:ReadOddsQuote={quoteId:'quote-test',fixtureId:'f',providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.12345678',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true};
const snapshot:OddsReadSnapshot={quotes:[q],kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED'};
const nearTtl=freshnessTtlMs(1,1);
describe('exact selection comparison',()=>{
  it('shows a stored pregame quote days before kickoff and does not shorten its lifetime at a tier boundary',()=>{
    const observed=now-60*60000,kickoff=new Date(now+47.5*3600000).toISOString();
    const quote={...q,providerKickoff:kickoff,observedAt:new Date(observed).toISOString(),lastSuccessfulRefreshAt:new Date(observed).toISOString(),freshnessTtlMinutes:365};
    const snap={quotes:[quote],kickoff,fixtureStatus:'SCHEDULED'};
    expect(buildComparison(snap,'MATCH_WINNER',now).eligiblePrices).toBe(2);
    expect(quoteState(quote,snap,observed+365*60000-1)).toBe('ACTIVE');
    expect(quoteState(quote,snap,observed+365*60000)).toBe('STALE');
    expect(quoteState(quote,snap,Date.parse(kickoff))).toBe('CLOSED');
  });
  it('preserves precision and never marks one bookmaker best',()=>{
    const c=buildComparison(snapshot,'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.cells[0].decimalOdds)).toEqual(['2.12345678','2.12345678']);
    expect(c.rows[0].cells[0]).toMatchObject({priceKind:'REAL',targetBookmaker:'betano.bet.br',sourceBookmaker:'betano.bet.br',sourceQuoteId:'quote-test',best:false});
    expect(c.rows[1].cells[0]).toMatchObject({priceKind:'PROXY',targetBookmaker:'betsson',sourceBookmaker:'betano.bet.br',sourceQuoteId:'quote-test',best:false});
    expect(c.rows.every(row=>row.cells[1].decimalOdds===null)).toBe(true);
  });
  it('compares exact outcomes only, with ties across genuinely eligible books',()=>{
    const c=buildComparison({...snapshot,quotes:[q,{...q,quoteId:'quote-betsson',bookmaker:'betsson',bookmakerName:'Betsson'}]},'MATCH_WINNER',now);
    expect(c.rows.every(r=>r.cells[0].best)).toBe(true);
    expect(c.rows.every(r=>!r.cells[1].best)).toBe(true);
  });
  it.each(['SUSPENDED','STALE','WITHDRAWN','CLOSED'] as const)('does not compare %s prices',status=>{
    const c=buildComparison({...snapshot,quotes:[q,{...q,bookmaker:'betsson',status}]},'MATCH_WINNER',now);
    expect(c.rows.every(row=>!row.cells[0].best)).toBe(true);expect(c.eligiblePrices).toBe(2);
    expect(c.rows[1].cells[0]).toMatchObject({priceKind:'PROXY',sourceBookmaker:'betano.bet.br'});
  });
  it('excludes GEO-unverified or Mexico-ineligible prices',()=>{
    expect(buildComparison({...snapshot,quotes:[{...q,geoEligible:false}]},'MATCH_WINNER',now).rows).toHaveLength(0);
  });
  it('expires using observation, not last price-change or page-read time',()=>{
    expect(quoteState(q,snapshot,now)).toBe('ACTIVE');
    expect(quoteState(q,snapshot,now+nearTtl)).toBe('STALE');
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
  it('only attaches an approved destination action while the quote is eligible and fresh',()=>{
    const actions={'betano.bet.br':'/go/betano.bet.br?placement=match-odds'};
    expect(buildComparison(snapshot,'MATCH_WINNER',now).rows[0].action).toBeNull();
    expect(buildComparison(snapshot,'MATCH_WINNER',now,actions).rows[0].action).toBe(actions['betano.bet.br']);
    expect(buildComparison(snapshot,'MATCH_WINNER',now,{...actions,betsson:'/go/betsson?placement=match-odds'}).rows[1].action).toContain('/go/betsson');
    expect(buildComparison(snapshot,'MATCH_WINNER',now+nearTtl,actions).rows[0].action).toBeNull();
    expect(buildComparison(snapshot,'MATCH_WINNER',Date.parse(q.providerKickoff),actions).rows[0].action).toBeNull();
  });
  it('keeps a one-feed near-kickoff quote current through the 15m cadence plus one tick',()=>{
    expect(quoteState(q,snapshot,now+15*60000-1)).toBe('ACTIVE');
    expect(quoteState(q,snapshot,now+nearTtl-1)).toBe('ACTIVE');
  });
  it('keeps a 24h-out quote current for the 120m cadence, not the old 15m wall',()=>{
    const kickoff=new Date(now+24*3600000).toISOString();
    const far={...q,providerKickoff:kickoff,observedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString()};
    const snap:OddsReadSnapshot={quotes:[far],kickoff,fixtureStatus:'SCHEDULED'};
    expect(quoteState(far,snap,now+15*60000)).toBe('ACTIVE');
    expect(quoteState(far,snap,now+freshnessTtlMs(24,1)-1)).toBe('ACTIVE');
    expect(quoteState(far,snap,now+freshnessTtlMs(24,1))).toBe('STALE');
  });
  it('applies exact union coverage in both directions without mutating provider truth',()=>{
    const betsson={...q,quoteId:'betsson-away',bookmaker:'betsson',bookmakerName:'Betsson',outcome:'AWAY' as const,decimalOdds:'2.25'};
    const quotes=[betsson];const before=structuredClone(quotes);
    const c=buildComparison({...snapshot,quotes},'MATCH_WINNER',now);
    expect(c.rows[0].cells[2]).toMatchObject({decimalOdds:'2.25',priceKind:'PROXY',targetBookmaker:'betano.bet.br',sourceBookmaker:'betsson',sourceQuoteId:'betsson-away'});
    expect(c.rows[1].cells[2]).toMatchObject({decimalOdds:'2.25',priceKind:'REAL',targetBookmaker:'betsson',sourceBookmaker:'betsson'});
    expect(quotes).toEqual(before);
  });
  it('fills only exact current missing selections and rejects an invalid source',()=>{
    const quotes=[
      {...q,decimalOdds:'2.92'},
      {...q,quoteId:'betano-draw',outcome:'DRAW' as const,decimalOdds:'3.80'},
      {...q,quoteId:'betsson-away',bookmaker:'betsson',bookmakerName:'Betsson',outcome:'AWAY' as const,decimalOdds:'2.25'},
    ];
    const c=buildComparison({...snapshot,quotes},'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.cells.map(cell=>cell.decimalOdds))).toEqual([['2.92','3.80','2.25'],['2.92','3.80','2.25']]);
    expect(c.rows[0].cells.map(cell=>cell.priceKind)).toEqual(['REAL','REAL','PROXY']);
    expect(c.rows[1].cells.map(cell=>cell.priceKind)).toEqual(['PROXY','PROXY','REAL']);
    const invalid=buildComparison({...snapshot,quotes:[{...q,status:'SUSPENDED'}]},'MATCH_WINNER',now);
    expect(invalid.eligiblePrices).toBe(0);expect(invalid.rows.every(row=>row.cells.every(cell=>cell.decimalOdds===null))).toBe(true);
  });
});
