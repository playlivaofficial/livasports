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

/**
 * Colombia is the only jurisdiction that compares two books, so Betsson and bwin are the pair these
 * invariants are expressed against. Proxy coverage is dormant in production (insuranceEnabled false
 * on both read paths); it is enabled here so the disclosure rules stay covered.
 */
const CO=[{id:'betsson',name:'Betsson',priority:10},{id:'bwin',name:'bwin',priority:20}];
const snap=(quotes:ReadOddsQuote[],insuranceEnabled=true):OddsReadSnapshot=>
  ({quotes,kickoff,fixtureStatus:'SCHEDULED',eligibleBookmakers:CO,insuranceEnabled});
const home=(c:ReturnType<typeof buildComparison>,bk:string)=>c.rows.find(row=>row.bookmaker===bk)?.cells[0];
const RETIRED=['1xbet','sportingbet.bet.br','betano.bet.br','betboo.bet.br'];

describe('public odds provenance invariants',()=>{
  it('never replaces a valid native price with a cheaper peer proxy',()=>{
    // bwin is present and cheaper, which is exactly when a careless resolver would substitute.
    const c=buildComparison(snap([quote('betsson','2.50'),quote('bwin','1.80')]),'MATCH_WINNER',now);
    expect(home(c,'betsson')).toMatchObject({decimalOdds:'2.50',priceKind:'REAL',sourceBookmaker:'betsson'});
    expect(home(c,'bwin')).toMatchObject({decimalOdds:'1.80',priceKind:'REAL',sourceBookmaker:'bwin'});
  });

  it('never borrows a price into a book that did not publish one',()=>{
    const c=buildComparison(snap([quote('betsson','1.95')]),'MATCH_WINNER',now);
    expect(home(c,'betsson')).toMatchObject({decimalOdds:'1.95',priceKind:'REAL',sourceBookmaker:'betsson'});
    // bwin published nothing, so bwin shows nothing. Displaying Betsson's 1.95 here would state that
    // bwin is offering 1.95, which is the one thing the comparison must never claim.
    expect(home(c,'bwin')).toMatchObject({decimalOdds:null,priceKind:null,sourceBookmaker:null});
  });

  it('leaves the unpriced book empty in either direction',()=>{
    const c=buildComparison(snap([quote('bwin','2.40')]),'MATCH_WINNER',now);
    expect(home(c,'bwin')).toMatchObject({priceKind:'REAL',sourceBookmaker:'bwin'});
    expect(home(c,'betsson')).toMatchObject({decimalOdds:null,priceKind:null,sourceBookmaker:null});
  });

  it('identical native prices stay native for both and never trigger fallback',()=>{
    const c=buildComparison(snap([quote('betsson','2.20'),quote('bwin','2.20')]),'MATCH_WINNER',now);
    expect(home(c,'betsson')).toMatchObject({decimalOdds:'2.20',priceKind:'REAL',sourceBookmaker:'betsson'});
    expect(home(c,'bwin')).toMatchObject({decimalOdds:'2.20',priceKind:'REAL',sourceBookmaker:'bwin'});
  });

  it('exposes only the GEO eligible books as public rows',()=>{
    const c=buildComparison(snap([quote('betsson','1.95')]),'MATCH_WINNER',now);
    expect(c.rows.map(row=>row.bookmaker)).toEqual(['betsson','bwin']);
    for(const retired of RETIRED)expect(c.rows.some(row=>row.bookmaker===retired)).toBe(false);
    // No jurisdiction shows every registered identity; the public set is always a GEO subset.
    expect(c.rows.length).toBeLessThan(VISIBLE_BOOKMAKERS.length+RETIRED.length);
  });

  it('does not treat a retired quote as a usable source for any book',()=>{
    for(const retired of RETIRED){
      const c=buildComparison(snap([quote(retired,'1.50')]),'MATCH_WINNER',now);
      expect(c.rows.every(row=>row.cells.every(cell=>cell.decimalOdds===null))).toBe(true);
      expect(c.rows.every(row=>row.cells.every(cell=>cell.sourceBookmaker!==retired))).toBe(true);
      expect(c.eligiblePrices).toBe(0);
    }
  });

  it('leaves a selection blank rather than borrowing once proxy coverage is off',()=>{
    const c=buildComparison(snap([quote('betsson','1.95')],false),'MATCH_WINNER',now);
    expect(home(c,'betsson')).toMatchObject({priceKind:'REAL'});
    expect(home(c,'bwin')).toMatchObject({decimalOdds:null,priceKind:null});
  });
});
