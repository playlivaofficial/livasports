import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {canonicalBookmakerSlug} from './bookmaker';
import {buildComparison,quoteState} from './comparison';
import {listingMatchWinnerOdds} from './listing';
import {listingBookmakerRows} from '@/components/sports/OddsComparison';
import {FixtureStatus,MarketCode,OutcomeCode} from '@/domain/enums';
import type {FixtureView} from '@/delivery/types';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
import {inspectCatalogMarkets,SUPPORTED_M5_MARKETS} from '@/providers/oddspapi/m5-normalizer';

const now=Date.parse('2026-09-12T18:00:00Z');
const quote=(overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({
  fixtureId:'f',providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',
  market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'1.90',status:'ACTIVE',scope:'FULL_TIME_REGULATION',
  phase:'PREGAME',providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),
  persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),
  providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true,...overrides,
});
const allMarkets=(bookmaker:ReadOddsQuote['bookmaker'],name:string,home:string):ReadOddsQuote[]=>[
  quote({bookmaker,bookmakerName:name,decimalOdds:home}),
  quote({bookmaker,bookmakerName:name,outcome:'DRAW',decimalOdds:'3.40'}),
  quote({bookmaker,bookmakerName:name,outcome:'AWAY',decimalOdds:'4.10'}),
  quote({bookmaker,bookmakerName:name,market:'BTTS',outcome:'YES',decimalOdds:'1.80'}),
  quote({bookmaker,bookmakerName:name,market:'BTTS',outcome:'NO',decimalOdds:'2.05'}),
  quote({bookmaker,bookmakerName:name,market:'TOTAL_GOALS',outcome:'OVER',line:2.5,decimalOdds:'1.95'}),
  quote({bookmaker,bookmakerName:name,market:'TOTAL_GOALS',outcome:'UNDER',line:2.5,decimalOdds:'1.85'}),
];

describe('full odds parity identity',()=>{
  it('normalizes bookmaker slugs without changing canonical identity',()=>{
    expect(canonicalBookmakerSlug('betano')).toBe('betano.bet.br');
    expect(canonicalBookmakerSlug('Betano.bet.br')).toBe('betano.bet.br');
    expect(canonicalBookmakerSlug('betsson.com')).toBe('betsson');
    expect(canonicalBookmakerSlug('unknown')).toBeNull();
  });
  it('keeps listing, match page and slip on the same quotes when both books price the match',()=>{
    const snapshot:OddsReadSnapshot={kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED',quotes:[...allMarkets('betano.bet.br','Betano BR','1.90'),...allMarkets('betsson','Betsson','1.85')]};
    const listing=listingMatchWinnerOdds(snapshot,now);
    expect(listing.oddsState).toBe('complete');
    expect(listing.odds[0].outcomes[0].prices.map(price=>price.bookmaker)).toEqual(['Betano BR','Betsson']);
    for(const market of SUPPORTED_M5_MARKETS){
      const comparison=buildComparison(snapshot,market,now);
      expect(comparison.rows.map(row=>row.bookmaker)).toEqual(['betano.bet.br','betsson']);
      expect(comparison.rows.every(row=>row.cells.some(cell=>cell.decimalOdds!==null))).toBe(true);
    }
  });
  it('shows Betano only or Betsson only without inventing the missing book',()=>{
    const betano=listingMatchWinnerOdds({kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED',quotes:allMarkets('betano.bet.br','Betano BR','1.90')},now);
    const betsson=listingMatchWinnerOdds({kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED',quotes:allMarkets('betsson','Betsson','1.85')},now);
    expect(betano.oddsState).toBe('partial');
    expect(betano.odds[0].outcomes[0].prices.map(price=>price.bookmaker)).toEqual(['Betano BR']);
    expect(betsson.oddsState).toBe('partial');
    expect(betsson.odds[0].outcomes[0].prices.map(price=>price.bookmaker)).toEqual(['Betsson']);
  });
  it('keeps canonical market identity independent of locale labels',()=>{
    expect(SUPPORTED_M5_MARKETS).toEqual(['MATCH_WINNER','BTTS','TOTAL_GOALS']);
    const snapshot:OddsReadSnapshot={kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED',quotes:allMarkets('betsson','Betsson','1.70')};
    expect(buildComparison(snapshot,'MATCH_WINNER',now).rows[0].cells.map(cell=>cell.outcome)).toEqual(['HOME','DRAW','AWAY']);
    expect(buildComparison(snapshot,'BTTS',now).rows[0].cells.map(cell=>cell.outcome)).toEqual(['YES','NO']);
    expect(buildComparison(snapshot,'TOTAL_GOALS',now).line).toBe(2.5);
  });
  it('does not treat a persisted ACTIVE quote as market closed after a later kickoff edit',()=>{
    const q=quote();
    expect(quoteState(q,{quotes:[q],kickoff:'2026-09-12T19:05:00Z',fixtureStatus:'SCHEDULED'},now)).toBe('ACTIVE');
    expect(quoteState({...q,status:'CLOSED'},{quotes:[q],kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED'},now)).toBe('CLOSED');
    expect(quoteState({...q,status:'SUSPENDED'},{quotes:[q],kickoff:q.providerKickoff,fixtureStatus:'SCHEDULED'},now)).toBe('SUSPENDED');
  });
  it('renders both listing bookmakers from the same MATCH_WINNER prices',()=>{
    const fixture:FixtureView={
      id:'internal',competition:'Serie A',homeTeam:'Flamengo',awayTeam:'Mirassol',kickoff:'2026-09-12T19:00:00Z',
      status:FixtureStatus.SCHEDULED,homeScore:null,awayScore:null,freshness:'fresh',oddsState:'complete',
      odds:[{market:MarketCode.MATCH_WINNER,line:null,outcomes:[
        {outcome:OutcomeCode.HOME,prices:[{bookmaker:'Betano BR',decimalOdds:1.9,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'},{bookmaker:'Betsson',decimalOdds:1.85,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'}]},
        {outcome:OutcomeCode.DRAW,prices:[{bookmaker:'Betano BR',decimalOdds:3.4,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'},{bookmaker:'Betsson',decimalOdds:3.2,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'}]},
        {outcome:OutcomeCode.AWAY,prices:[{bookmaker:'Betano BR',decimalOdds:4.1,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'},{bookmaker:'Betsson',decimalOdds:4.2,providerUpdatedAt:'2026-09-12T10:00:00Z',freshness:'fresh'}]},
      ]}],
    };
    expect(listingBookmakerRows(fixture).map(row=>row.label)).toEqual(['Betano','Betsson']);
  });
  it('does not invent extra catalog markets',()=>{
    const catalog=inspectCatalogMarkets([
      {marketId:101,sportId:10,marketName:'Full Time Result',marketType:'1x2',period:'fulltime',playerProp:false,handicap:0},
      {marketId:10761,sportId:10,marketName:'Double Chance',marketType:'doublechance',period:'fulltime',playerProp:false,handicap:0},
    ]);
    expect(catalog.filter(row=>row.supported).map(row=>row.marketId)).toEqual(['101']);
    expect(catalog.find(row=>row.marketId==='10761')?.supported).toBe(false);
  });
});
