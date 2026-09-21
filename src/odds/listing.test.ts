import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {FixtureStatus,MarketCode,OutcomeCode} from '@/domain/enums';
import type {M2PageData} from '@/delivery/types';
import {attachListingOdds,listingMatchWinnerOdds} from './listing';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';

const now=Date.parse('2026-09-12T18:00:00Z');
const fixtureId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const quote=(overrides:Partial<ReadOddsQuote>={}):ReadOddsQuote=>({
  quoteId:'quote-test',fixtureId,providerFixtureId:'p',bookmaker:'betano.bet.br',bookmakerId:'b',bookmakerName:'Betano BR',
  market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'4.45',status:'ACTIVE',scope:'FULL_TIME_REGULATION',
  phase:'PREGAME',providerUpdatedAt:'2026-09-12T10:00:00Z',observedAt:new Date(now).toISOString(),
  persistedAt:new Date(now).toISOString(),lastSuccessfulRefreshAt:new Date(now).toISOString(),
  providerKickoff:'2026-09-12T19:00:00Z',sourceDomain:'www.betano.bet.br',geoEligible:true,...overrides,
});
const snapshot=(quotes:ReadOddsQuote[]):OddsReadSnapshot=>({quotes,kickoff:'2026-09-12T19:00:00Z',fixtureStatus:'SCHEDULED'});

describe('listing MATCH_WINNER read model',()=>{
  it('reproduces Brentford–Chelsea Betano 2.92/3.80/2.25 as complete two-row union coverage',()=>{
    const attached=listingMatchWinnerOdds(snapshot([
      quote({decimalOdds:'2.92'}),quote({quoteId:'quote-draw',outcome:'DRAW',decimalOdds:'3.80'}),quote({quoteId:'quote-away',outcome:'AWAY',decimalOdds:'2.25'}),
    ]),now);
    expect(attached.oddsState).toBe('complete');
    expect(attached.odds[0].outcomes.map(outcome=>outcome.prices.map(price=>price.decimalOdds))).toEqual([[2.92,2.92,2.92],[3.8,3.8,3.8],[2.25,2.25,2.25]]);
    expect(attached.odds[0].outcomes.every(outcome=>outcome.prices.every(price=>price.priceKind==='PROXY'))).toBe(true);
    expect(JSON.stringify(attached)).not.toMatch(/sourceBookmaker|sourceQuoteId|betano\.bet\.br/);
  });
  it('attaches current 1X2 from the same quoteState as the match page',()=>{
    const attached=listingMatchWinnerOdds(snapshot([
      quote(),quote({outcome:'DRAW',decimalOdds:'4.00'}),quote({outcome:'AWAY',decimalOdds:'1.72'}),
      quote({bookmaker:'betsson',bookmakerName:'Betsson',decimalOdds:'4.20'}),
      quote({bookmaker:'betsson',bookmakerName:'Betsson',outcome:'DRAW',decimalOdds:'3.90'}),
      quote({bookmaker:'betsson',bookmakerName:'Betsson',outcome:'AWAY',decimalOdds:'1.80'}),
    ]),now);
    expect(attached.oddsState).toBe('complete');
    expect(attached.odds[0].market).toBe(MarketCode.MATCH_WINNER);
    expect(attached.odds[0].outcomes.map(outcome=>outcome.outcome)).toEqual([OutcomeCode.HOME,OutcomeCode.DRAW,OutcomeCode.AWAY]);
    expect(attached.odds[0].outcomes[0].prices.map(price=>price.decimalOdds)).toEqual([4.2,4.45,4.45]);
    expect(attached.odds[0].outcomes[0].prices.map(price=>price.priceKind)).toEqual(['REAL','PROXY','PROXY']);
  });

  it('does not treat geo-ineligible or stale quotes as listing prices',()=>{
    expect(listingMatchWinnerOdds(snapshot([quote({geoEligible:false})]),now).oddsState).toBe('none');
    expect(listingMatchWinnerOdds(snapshot([quote({observedAt:'2026-09-12T10:00:00Z',lastSuccessfulRefreshAt:'2026-09-12T10:00:00Z'})]),now).oddsState).toBe('stale');
  });
});

describe('listing Neon attach',()=>{
  const page=():M2PageData=>({
    locale:'br',page:'home',currentDate:'date',timeZone:'America/Sao_Paulo',
    sportsData:{state:'available',freshness:'fresh',reason:'ok'},
    oddsData:{state:'available',freshness:'unavailable',reason:'no-data'},
    competitions:['Premier League'],paidOddsRequests:0,
    sections:[{competition:'Premier League',slug:'premier-league',group:'EUROPE',priority:1,fixtures:[
      {id:fixtureId,competition:'Premier League',homeTeam:'Brentford',awayTeam:'Chelsea',kickoff:'2026-09-12T19:00:00Z',
        status:FixtureStatus.SCHEDULED,homeScore:null,awayScore:null,freshness:'fresh',odds:[],oddsState:'none'},
      {id:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',competition:'Premier League',homeTeam:'No',awayTeam:'Odds',kickoff:'2026-09-12T20:00:00Z',
        status:FixtureStatus.SCHEDULED,homeScore:null,awayScore:null,freshness:'fresh',odds:[],oddsState:'none'},
    ]}],
  });
  const row=(overrides:Record<string,unknown>={})=>{
    const q=quote();
    return {canonical_fixture_id:fixtureId,kickoff:new Date(q.providerKickoff),fixture_status:'SCHEDULED',bookmaker_id:'b',
      provider_slug:q.bookmaker,display_name:q.bookmakerName,source_domain:q.sourceDomain,verification_state:'VERIFIED_BR',
      geo_eligible:true,source_geo:'BR',source_verification_state:'VERIFIED_BR',display_eligible:true,mapping_verified:true,scope:q.scope,phase:q.phase,observed_at:new Date(now),provider_updated_at:new Date(q.providerUpdatedAt!),
      persisted_at:new Date(now),last_successful_refresh_at:new Date(now),provider_kickoff:new Date(q.providerKickoff),
      market_code:'MATCH_WINNER',outcome_code:q.outcome,line:null,decimal_odds:q.decimalOdds,status:'ACTIVE',...overrides};
  };

  it('reads odds_current MATCH_WINNER in one bounded query and never calls a provider',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row(),row({outcome_code:'DRAW',decimal_odds:'4.00'}),row({outcome_code:'AWAY',decimal_odds:'1.72'})]});
    const fetch=vi.spyOn(globalThis,'fetch');
    const attached=await attachListingOdds({query},page(),now,'BR');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("o.market_code='MATCH_WINNER'");
    expect(query.mock.calls[0][0]).toContain('f.id=ANY($1::uuid[])');
    expect(query.mock.calls[0][1][1]).toBe('BR');
    expect(query.mock.calls[0][1][0]).toEqual(expect.arrayContaining([fixtureId]));
    expect(fetch).not.toHaveBeenCalled();
    const brentford=attached.sections[0].fixtures[0];
    const empty=attached.sections[0].fixtures[1];
    expect(brentford.oddsState).toBe('complete');
    expect(brentford.odds[0].outcomes.map(outcome=>outcome.prices[0]?.decimalOdds)).toEqual([4.45,4,1.72]);
    expect(brentford.odds[0].outcomes.every(outcome=>outcome.prices.length===3)).toBe(true);
    expect(brentford.odds[0].outcomes.every(outcome=>outcome.prices[1].priceKind==='PROXY')).toBe(true);
    expect(brentford.odds[0].outcomes[0].prices[0]).toMatchObject({bookmaker:'Betsson',targetBookmaker:'betsson'});
    expect(JSON.stringify(brentford)).not.toMatch(/sourceBookmaker|sourceQuoteId|betano\.bet\.br/);
    expect(empty.odds).toEqual([]);
    expect(empty.oddsState).toBe('none');
    expect(attached.paidOddsRequests).toBe(0);
    fetch.mockRestore();
  });

  it.each(['br','mx'] as const)('shows BR feed prices on %s pages without eligible commercial GEO',async locale=>{
    const query=vi.fn().mockResolvedValue({rows:[row({geo_eligible:false})]});
    const attached=await attachListingOdds({query},{...page(),locale},now,null);
    expect(query.mock.calls[0][1][1]).toBeNull();
    expect(attached.sections[0].fixtures[0].odds[0].outcomes[0].prices[0].decimalOdds).toBe(4.45);
    expect(attached.paidOddsRequests).toBe(0);
    query.mockClear();
    const serieB={...page(),sections:[{...page().sections[0],slug:'brasileirao-serie-b',competition:'Brasileirão Série B'}]};
    await attachListingOdds({query},serieB,now,'BR');
    expect(query.mock.calls[0][1][1]).toBe('BR');
    const laLiga={...page(),sections:[{...page().sections[0],slug:'la-liga',competition:'La Liga'}]};
    await attachListingOdds({query},laLiga,now,'BR');
    expect(query.mock.calls[1][1][1]).toBe('BR');
    expect(query.mock.calls[1][0]).toContain("o.market_code='MATCH_WINNER'");
  });
});
