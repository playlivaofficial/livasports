import {describe,expect,it} from 'vitest';
import {classifyFixtureCoverage,COVERAGE_STATUSES,coverageWindows,type FixtureCoverageRow,type MarketFlags} from './fixture-coverage';
import type {ProviderOddsFixture} from './types';

const off:MarketFlags={stored:false,listingCurrent:false,stale:false,withdrawn:false,dropped:false};
const current:MarketFlags={stored:true,listingCurrent:true,stale:false,withdrawn:false,dropped:false};
const books=(betano:MarketFlags,betsson:MarketFlags={...off})=>({betano,betsson});
const raw=(overrides:Partial<ProviderOddsFixture>={}):ProviderOddsFixture=>({
  providerId:'p1',sport:'FOOTBALL',competition:'liga-mx',providerCompetitionId:'27464',
  kickoff:'2026-09-21T00:00:00Z',status:'PREGAME',homeProviderId:'h',awayProviderId:'a',
  homeNames:['CF Pachuca','Pachuca'],awayNames:['Club Tijuana de Caliente','Tijuana de Caliente'],...overrides,
});
const base={
  publicId:'2ac84601e4044a47',competition:'Liga MX',slug:'liga-mx',kickoff:'2026-09-21T00:00:00.000Z',
  home:'Pachuca',away:'Tijuana',tournamentId:'27464',schedulerEnabled:true,now:Date.parse('2026-09-14T18:00:00Z'),
  providerHorizon:'2026-09-21T03:00:00.000Z',providerFixtures:[] as ProviderOddsFixture[],
  matchWinner:books(off),totalGoals25:books(off),btts:books(off),
};

describe('fixture coverage classification',()=>{
  it('classifies every allowed status without leaving a fixture unexplained',()=>{
    expect(COVERAGE_STATUSES).toContain('CURRENT_ODDS_AVAILABLE');
    expect(classifyFixtureCoverage({...base,mapped:true,matchWinner:books(current,current)}).classification).toBe('CURRENT_ODDS_AVAILABLE');
    expect(classifyFixtureCoverage({...base,mapped:false,providerFixtures:[],schedulerEnabled:false}).classification).toBe('TOURNAMENT_NOT_ACTIVE');
    expect(classifyFixtureCoverage({...base,mapped:false,tournamentId:null,schedulerEnabled:false,providerFixtures:[]}).classification).toBe('OTHER_VERIFIED_REASON');
    expect(classifyFixtureCoverage({...base,mapped:false,providerFixtures:[],providerHorizon:'2026-09-16T00:00:00.000Z',kickoff:'2026-10-20T00:00:00.000Z'}).classification).toBe('PROVIDER_FIXTURE_ABSENT');
    expect(classifyFixtureCoverage({...base,mapped:true,matchWinner:books({...off,stored:true,dropped:true})}).classification).toBe('READ_MODEL_DROPPED_QUOTE');
    expect(classifyFixtureCoverage({...base,mapped:true,matchWinner:books({...off,stored:true,stale:true})}).classification).toBe('QUOTE_STALE');
    expect(classifyFixtureCoverage({...base,mapped:true,matchWinner:books({...off,stored:true,withdrawn:true})}).classification).toBe('WITHDRAWN');
    expect(classifyFixtureCoverage({...base,mapped:true,providerFixtures:[raw()]}).classification).toBe('BOOKMAKER_DOES_NOT_PRICE_FIXTURE');
  });
  it('treats a confident Tijuana provider match without persistence as a mapping bug, not provider absence',()=>{
    const row=classifyFixtureCoverage({...base,mapped:false,providerFixtures:[raw()]});
    expect(row.classification).toBe('FIXTURE_MAPPING_MISSING');
    expect(row.providerFixturePresent).toBe(true);
    expect(row.internalBug).toBe(true);
    expect(row.evidence).toContain('p1');
  });
  it('keeps a later-season fixture outside the snapshot horizon as provider-absent',()=>{
    const row=classifyFixtureCoverage({
      ...base,publicId:'later',home:'Atlante',away:'Monterrey',kickoff:'2026-11-01T00:00:00.000Z',mapped:false,
      providerFixtures:[raw()],providerHorizon:'2026-09-21T03:00:00.000Z',
    });
    expect(row.classification).toBe('PROVIDER_FIXTURE_ABSENT');
    expect(row.evidence).toContain('horizon');
    expect(row.internalBug).toBe(false);
  });
  it('reports near-term coverage windows instead of a full-calendar percentage',()=>{
    const row=(kickoff:string,classification:FixtureCoverageRow['classification'],flags?:Partial<FixtureCoverageRow>):FixtureCoverageRow=>({
      publicId:kickoff,competition:'Liga MX',slug:'liga-mx',kickoff,home:'A',away:'B',oddspapiTournamentId:'27464',
      providerFixturePresent:classification==='CURRENT_ODDS_AVAILABLE',strictMappingPresent:true,
      betanoCurrentQuote:classification==='CURRENT_ODDS_AVAILABLE',betssonCurrentQuote:classification==='CURRENT_ODDS_AVAILABLE',
      matchWinner:classification==='CURRENT_ODDS_AVAILABLE'?'AVAILABLE':'ABSENT',
      totalGoals25:classification==='CURRENT_ODDS_AVAILABLE'?'AVAILABLE':'ABSENT',
      btts:classification==='CURRENT_ODDS_AVAILABLE'?'AVAILABLE':'ABSENT',
      classification,evidence:'test',internalBug:false,
      betanoProviderFixturePresent:classification==='CURRENT_ODDS_AVAILABLE',betssonProviderFixturePresent:classification==='CURRENT_ODDS_AVAILABLE',
      betanoProviderPriced:classification==='CURRENT_ODDS_AVAILABLE',betssonProviderPriced:classification==='CURRENT_ODDS_AVAILABLE',
      betanoMarkets:classification==='CURRENT_ODDS_AVAILABLE'?['MATCH_WINNER']:[],betssonMarkets:classification==='CURRENT_ODDS_AVAILABLE'?['MATCH_WINNER']:[],
      listingVisible:classification==='CURRENT_ODDS_AVAILABLE',matchPageVisible:classification==='CURRENT_ODDS_AVAILABLE',slipUsable:classification==='CURRENT_ODDS_AVAILABLE',
      betanoMissingReason:classification==='CURRENT_ODDS_AVAILABLE'?null:'PROVIDER_ABSENT',
      betssonMissingReason:classification==='CURRENT_ODDS_AVAILABLE'?null:'PROVIDER_ABSENT',
      unexplainedMissing:0,...flags,
    });
    const now=Date.parse('2026-09-15T12:00:00Z');
    const windows=coverageWindows([
      row('2026-09-15T20:00:00.000Z','CURRENT_ODDS_AVAILABLE'),
      row('2026-09-17T20:00:00.000Z','PROVIDER_FIXTURE_ABSENT'),
      row('2026-09-25T20:00:00.000Z','CURRENT_ODDS_AVAILABLE'),
      row('2026-11-01T20:00:00.000Z','PROVIDER_FIXTURE_ABSENT'),
    ],now);
    expect(windows.map(item=>item.key)).toEqual(['next24h','next3d','next7d','next14d','fullUpcoming']);
    expect(windows[0]).toMatchObject({total:1,matchWinner:1,percent:100});
    expect(windows[1]).toMatchObject({total:2,matchWinner:1,percent:50});
    expect(windows[2]).toMatchObject({total:2,matchWinner:1});
    expect(windows[3]).toMatchObject({total:3,matchWinner:2});
    expect(windows[4]).toMatchObject({total:4,matchWinner:2,percent:50});
  });
  it('evaluates Betano and Betsson independently and flags only unexplained priced gaps',()=>{
    const priced=new Map([['p1',['MATCH_WINNER','BTTS','TOTAL_GOALS_2_5']]]);
    const both=classifyFixtureCoverage({
      ...base,mapped:true,providerFixtures:[raw()],matchWinner:books(current,current),
      totalGoals25:books(current,current),btts:books(current,current),
      providerByBook:{betano:[raw()],betsson:[raw()]},
      pricedMarketsByBook:{betano:priced,betsson:priced},
    });
    expect(both.betanoProviderPriced).toBe(true);
    expect(both.betssonProviderPriced).toBe(true);
    expect(both.listingVisible).toBe(true);
    expect(both.unexplainedMissing).toBe(0);
    const betanoOnly=classifyFixtureCoverage({
      ...base,mapped:true,providerFixtures:[raw()],matchWinner:books(current,off),
      providerByBook:{betano:[raw()],betsson:[]},
      pricedMarketsByBook:{betano:priced,betsson:new Map()},
    });
    expect(betanoOnly.betanoCurrentQuote).toBe(true);
    expect(betanoOnly.betssonProviderPriced).toBe(false);
    expect(betanoOnly.betssonMissingReason).toBe('PROVIDER_ABSENT');
    expect(betanoOnly.unexplainedMissing).toBe(0);
    const betssonOnly=classifyFixtureCoverage({
      ...base,mapped:true,providerFixtures:[raw()],matchWinner:books(off,current),
      providerByBook:{betano:[],betsson:[raw()]},
      pricedMarketsByBook:{betano:new Map(),betsson:priced},
    });
    expect(betssonOnly.betssonCurrentQuote).toBe(true);
    expect(betssonOnly.betanoProviderPriced).toBe(false);
    expect(betssonOnly.betanoMissingReason).toBe('PROVIDER_ABSENT');
    const silent=classifyFixtureCoverage({
      ...base,mapped:true,providerFixtures:[raw()],
      matchWinner:books({stored:true,listingCurrent:false,stale:false,withdrawn:false,dropped:false},current),
      providerByBook:{betano:[raw()],betsson:[raw()]},
      pricedMarketsByBook:{betano:priced,betsson:priced},
    });
    expect(silent.classification).toBe('CURRENT_ODDS_AVAILABLE');
    expect(silent.betanoMissingReason).toBe('UNEXPLAINED');
    expect(silent.unexplainedMissing).toBe(1);
    expect(silent.internalBug).toBe(true);
    const persistence=classifyFixtureCoverage({
      ...base,mapped:true,providerFixtures:[raw()],matchWinner:books(off,current),
      providerByBook:{betano:[raw()],betsson:[raw()]},
      pricedMarketsByBook:{betano:priced,betsson:priced},
    });
    expect(persistence.betanoMissingReason).toBe('PERSISTENCE_GAP');
    expect(persistence.unexplainedMissing).toBe(0);
    expect(persistence.internalBug).toBe(true);
  });
});
