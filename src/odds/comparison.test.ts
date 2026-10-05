import {describe,it,expect} from 'vitest';
import {buildComparison,quoteState} from './comparison';
import {freshnessTtlMs} from './scheduler-policy';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
const now=Date.parse('2026-09-12T18:00:00Z');

/**
 * Quotes here are Betsson's, the operator entitled in both Mexico and Colombia. Snapshots carry
 * explicit eligibleBookmakers because that is what the read layer always supplies, so these tests
 * exercise the real per-GEO shape: Mexico and Peru compare one book, Colombia two. Production also
 * pins insuranceEnabled false, so proxy coverage is opted into only where that feature is under test.
 */
const q:ReadOddsQuote={quoteId:'quote-test',fixtureId:'f',providerFixtureId:'p',bookmaker:'betsson',bookmakerId:'b',bookmakerName:'Betsson',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.12345678',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betsson.com',geoEligible:true};

const BETSSON={id:'betsson',name:'Betsson',priority:10};
const BWIN={id:'bwin',name:'bwin',priority:20};
const INKABET={id:'inkabet',name:'Inkabet',priority:30};
/** Mexico: Betsson only. */
const mx=(quotes:ReadOddsQuote[],extra:Partial<OddsReadSnapshot>={}):OddsReadSnapshot=>
  ({quotes,kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED',eligibleBookmakers:[BETSSON],insuranceEnabled:false,...extra});
/** Colombia: Betsson then bwin, ordered by configured public_priority. */
const co=(quotes:ReadOddsQuote[],extra:Partial<OddsReadSnapshot>={}):OddsReadSnapshot=>
  ({quotes,kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED',eligibleBookmakers:[BETSSON,BWIN],insuranceEnabled:false,...extra});
/** Peru: Inkabet only. */
const pe=(quotes:ReadOddsQuote[],extra:Partial<OddsReadSnapshot>={}):OddsReadSnapshot=>
  ({quotes,kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED',eligibleBookmakers:[INKABET],insuranceEnabled:false,...extra});

const snapshot=mx([q]);
const nearTtl=freshnessTtlMs(1,1);
const bwinQuote=(overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>
  ({...q,quoteId:'quote-bwin',bookmaker:'bwin',bookmakerName:'bwin',sourceDomain:'sports.bwin.com',...overrides});

describe('exact selection comparison',()=>{
  it('shows a stored pregame quote days before kickoff and does not shorten its lifetime at a tier boundary',()=>{
    const observed=now-60*60000,kickoff=new Date(now+47.5*3600000).toISOString();
    const quote={...q,providerKickoff:kickoff,observedAt:new Date(observed).toISOString(),lastSuccessfulRefreshAt:new Date(observed).toISOString(),freshnessTtlMinutes:365};
    const snap=mx([quote],{kickoff});
    expect(buildComparison(snap,'MATCH_WINNER',now).eligiblePrices).toBe(1);
    expect(quoteState(quote,snap,observed+365*60000-1)).toBe('ACTIVE');
    expect(quoteState(quote,snap,observed+365*60000)).toBe('STALE');
    expect(quoteState(quote,snap,Date.parse(kickoff))).toBe('CLOSED');
  });

  it('preserves precision and never marks a lone bookmaker best',()=>{
    const c=buildComparison(snapshot,'MATCH_WINNER',now);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].cells[0]).toMatchObject({decimalOdds:'2.12345678',priceKind:'REAL',targetBookmaker:'betsson',sourceBookmaker:'betsson',sourceQuoteId:'quote-test',best:false});
    expect(c.rows.every(row=>row.cells[1].decimalOdds===null)).toBe(true);
  });

  it('compares exact outcomes only, with ties across genuinely eligible books',()=>{
    const c=buildComparison(co([q,bwinQuote()]),'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.bookmaker)).toEqual(['betsson','bwin']);
    expect(c.rows.every(row=>row.cells[0].best)).toBe(true);
    expect(c.rows.every(row=>!row.cells[1].best)).toBe(true);
  });

  it('marks only the better price best when the two Colombian books differ',()=>{
    const c=buildComparison(co([q,bwinQuote({decimalOdds:'2.50'})]),'MATCH_WINNER',now);
    expect(c.rows.find(row=>row.bookmaker==='bwin')!.cells[0].best).toBe(true);
    expect(c.rows.find(row=>row.bookmaker==='betsson')!.cells[0].best).toBe(false);
  });

  it.each(['SUSPENDED','STALE','WITHDRAWN','CLOSED'] as const)('does not compare %s prices',status=>{
    const c=buildComparison(co([q,bwinQuote({status})]),'MATCH_WINNER',now);
    expect(c.rows.find(row=>row.bookmaker==='bwin')!.cells[0]).toMatchObject({decimalOdds:null,priceKind:null});
    expect(c.rows.every(row=>!row.cells[0].best)).toBe(true);
    expect(c.eligiblePrices).toBe(1);
  });

  it('excludes GEO-unverified prices entirely',()=>{
    expect(buildComparison(mx([{...q,geoEligible:false}]),'MATCH_WINNER',now).rows).toHaveLength(0);
  });

  it('never renders a bookmaker outside the GEO eligible set',()=>{
    // A bwin price leaking into a Mexican snapshot must not create a bwin row or price a Betsson cell.
    const c=buildComparison(mx([bwinQuote()]),'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.bookmaker)).not.toContain('bwin');
    expect(c.rows.every(row=>row.cells.every(cell=>cell.decimalOdds===null))).toBe(true);
    // And a Betsson price must never surface on a Peruvian board.
    expect(buildComparison(pe([q]),'MATCH_WINNER',now).rows.map(row=>row.bookmaker)).not.toContain('betsson');
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
    expect(buildComparison(mx([{...q,market:'TOTAL_GOALS',outcome:'OVER',line:3.5}]),'TOTAL_GOALS',now).rows).toHaveLength(0);
    expect(buildComparison(mx([q,q]),'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });

  it('only attaches an approved destination action while the quote is eligible and fresh',()=>{
    const foreign={bwin:'/go/bwin?placement=match-odds'};
    const own={betsson:'/go/betsson?placement=match-odds'};
    expect(buildComparison(snapshot,'MATCH_WINNER',now).rows[0].action).toBeNull();
    // An action for a bookmaker outside this GEO never attaches to the Betsson row.
    expect(buildComparison(snapshot,'MATCH_WINNER',now,foreign).rows.every(row=>row.action===null)).toBe(true);
    expect(buildComparison(snapshot,'MATCH_WINNER',now,{...foreign,...own}).rows[0].action).toContain('/go/betsson');
    expect(buildComparison(snapshot,'MATCH_WINNER',now+nearTtl,own).rows[0].action).toBeNull();
    expect(buildComparison(snapshot,'MATCH_WINNER',Date.parse(q.providerKickoff),own).rows[0].action).toBeNull();
  });

  it('keeps a one-feed near-kickoff quote current through the 15m cadence plus one tick',()=>{
    expect(quoteState(q,snapshot,now+15*60000-1)).toBe('ACTIVE');
    expect(quoteState(q,snapshot,now+nearTtl-1)).toBe('ACTIVE');
  });

  it('keeps a 24h-out quote current for the 120m cadence, not the old 15m wall',()=>{
    const kickoff=new Date(now+24*3600000).toISOString();
    const far={...q,providerKickoff:kickoff,observedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString()};
    const snap=mx([far],{kickoff});
    expect(quoteState(far,snap,now+15*60000)).toBe('ACTIVE');
    expect(quoteState(far,snap,now+freshnessTtlMs(24,1)-1)).toBe('ACTIVE');
    expect(quoteState(far,snap,now+freshnessTtlMs(24,1))).toBe('STALE');
  });

  it('leaves a missing selection unpriced when proxy coverage is off, as production has it',()=>{
    const away={...q,quoteId:'betsson-away',outcome:'AWAY' as const,decimalOdds:'2.25'};
    const c=buildComparison(co([away]),'MATCH_WINNER',now);
    expect(c.rows.find(row=>row.bookmaker==='bwin')!.cells.every(cell=>cell.decimalOdds===null)).toBe(true);
    expect(c.rows.find(row=>row.bookmaker==='betsson')!.cells[2]).toMatchObject({decimalOdds:'2.25',priceKind:'REAL'});
  });
});

/**
 * Proxy coverage is dormant: both production read paths set insuranceEnabled false. These tests opt
 * in explicitly to keep the mechanics covered, and assert provenance is always disclosed so a
 * borrowed price can never be mistaken for the row's own.
 */
describe('proxy coverage when explicitly enabled',()=>{
  it('applies exact union coverage in both directions without mutating provider truth',()=>{
    const away={...q,quoteId:'betsson-away',outcome:'AWAY' as const,decimalOdds:'2.25'};
    const quotes=[away];const before=structuredClone(quotes);
    const c=buildComparison(co(quotes,{insuranceEnabled:true}),'MATCH_WINNER',now);
    expect(c.rows.find(row=>row.bookmaker==='bwin')!.cells[2]).toMatchObject({decimalOdds:'2.25',priceKind:'PROXY',targetBookmaker:'bwin',sourceBookmaker:'betsson',sourceQuoteId:'betsson-away'});
    expect(c.rows.find(row=>row.bookmaker==='betsson')!.cells[2]).toMatchObject({decimalOdds:'2.25',priceKind:'REAL',targetBookmaker:'betsson',sourceBookmaker:'betsson'});
    expect(quotes).toEqual(before);
  });

  it('fills only exact current missing selections and rejects an invalid source',()=>{
    const quotes=[
      {...q,decimalOdds:'2.92'},
      {...q,quoteId:'betsson-draw',outcome:'DRAW' as const,decimalOdds:'3.80'},
      {...q,quoteId:'betsson-away',outcome:'AWAY' as const,decimalOdds:'2.25'},
    ];
    const c=buildComparison(co(quotes,{insuranceEnabled:true}),'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.cells.map(cell=>cell.decimalOdds))).toEqual([['2.92','3.80','2.25'],['2.92','3.80','2.25']]);
    expect(c.rows.find(row=>row.bookmaker==='betsson')!.cells.map(cell=>cell.priceKind)).toEqual(['REAL','REAL','REAL']);
    expect(c.rows.find(row=>row.bookmaker==='bwin')!.cells.every(cell=>cell.priceKind==='PROXY')).toBe(true);
    const invalid=buildComparison(co([{...q,status:'SUSPENDED'}],{insuranceEnabled:true}),'MATCH_WINNER',now);
    expect(invalid.eligiblePrices).toBe(0);
    expect(invalid.rows.every(row=>row.cells.every(cell=>cell.decimalOdds===null))).toBe(true);
  });

  it('never proxies across a GEO boundary',()=>{
    // Inkabet mirrors Betsson prices, so borrowing one for the other would be a fake comparison.
    const c=buildComparison(pe([q],{insuranceEnabled:true}),'MATCH_WINNER',now);
    expect(c.rows.every(row=>row.cells.every(cell=>cell.sourceBookmaker!=='betsson'))).toBe(true);
  });
});
