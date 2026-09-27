import {describe,it,expect} from 'vitest';
import {buildComparison} from './comparison';
import {VISIBLE_BOOKMAKERS} from './registry';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';

const now=Date.parse('2026-09-27T12:00:00Z');
const kickoff='2026-09-27T19:00:00Z';
const quote=(bookmaker:string,decimalOdds:string,overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({
  quoteId:`q-${bookmaker}-${decimalOdds}`,fixtureId:'f',providerFixtureId:'p',bookmaker,bookmakerId:bookmaker,bookmakerName:bookmaker,
  market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds,status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',
  providerUpdatedAt:new Date(now-60000).toISOString(),observedAt:new Date(now).toISOString(),persistedAt:new Date(now).toISOString(),
  lastSuccessfulRefreshAt:new Date(now).toISOString(),providerKickoff:kickoff,sourceDomain:'test.invalid',geoEligible:true,...overrides});
const snap=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({quotes,kickoff,fixtureStatus:'SCHEDULED'});
const home=(c:ReturnType<typeof buildComparison>,bk:string)=>c.rows.find(r=>r.bookmaker===bk)?.cells[0];

describe('public odds provenance invariants',()=>{
  it('never replaces a valid native 1xBet price with a proxy',()=>{
    // Betano is present and cheaper, which is exactly when a careless resolver would substitute.
    const c=buildComparison(snap([quote('1xbet','2.50'),quote('betano.bet.br','1.80'),quote('betsson','2.10')]),'MATCH_WINNER',now);
    expect(home(c,'1xbet')).toMatchObject({decimalOdds:'2.50',priceKind:'REAL',sourceBookmaker:'1xbet'});
  });
  it('labels a shared Betano fallback as proxy for BOTH books, so neither looks native',()=>{
    // This is the real production shape behind visually identical 1xBet/Sportingbet cells.
    const c=buildComparison(snap([quote('betano.bet.br','1.95')]),'MATCH_WINNER',now);
    const x=home(c,'1xbet'),s=home(c,'sportingbet.bet.br');
    expect(x).toMatchObject({decimalOdds:'1.95',priceKind:'PROXY',sourceBookmaker:'betano.bet.br'});
    expect(s).toMatchObject({decimalOdds:'1.95',priceKind:'PROXY',sourceBookmaker:'betano.bet.br'});
    // Identical displayed numbers are permitted, but only while both are disclosed as approximate.
    expect(x!.decimalOdds).toBe(s!.decimalOdds);
    expect([x!.priceKind,s!.priceKind]).toEqual(['PROXY','PROXY']);
  });
  it('keeps one book native and the other proxied when only one has its own price',()=>{
    const c=buildComparison(snap([quote('1xbet','2.40'),quote('betano.bet.br','2.40')]),'MATCH_WINNER',now);
    expect(home(c,'1xbet')).toMatchObject({priceKind:'REAL',sourceBookmaker:'1xbet'});
    expect(home(c,'sportingbet.bet.br')).toMatchObject({priceKind:'PROXY'});
  });
  it('identical native prices stay native for both and never trigger fallback',()=>{
    const c=buildComparison(snap([quote('1xbet','2.20'),quote('sportingbet.bet.br','2.20')]),'MATCH_WINNER',now);
    expect(home(c,'1xbet')).toMatchObject({decimalOdds:'2.20',priceKind:'REAL',sourceBookmaker:'1xbet'});
    expect(home(c,'sportingbet.bet.br')).toMatchObject({decimalOdds:'2.20',priceKind:'REAL',sourceBookmaker:'sportingbet.bet.br'});
  });
  it('never exposes Betano as a public row, even when it supplies every price',()=>{
    const c=buildComparison(snap([quote('betano.bet.br','1.95')]),'MATCH_WINNER',now);
    expect(c.rows.map(r=>r.bookmaker)).toEqual(VISIBLE_BOOKMAKERS.map(b=>b.canonicalId));
    expect(c.rows.some(r=>r.bookmaker==='betano.bet.br')).toBe(false);
    expect(c.rows.some(r=>r.bookmaker==='betboo.bet.br')).toBe(false);
  });
  it('does not treat a retired Betboo quote as a usable source',()=>{
    const c=buildComparison(snap([quote('betboo.bet.br','1.50')]),'MATCH_WINNER',now);
    expect(c.rows.every(r=>r.cells.every(cell=>cell.decimalOdds===null))).toBe(true);
  });
});
