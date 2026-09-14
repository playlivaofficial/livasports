import {describe,expect,it} from 'vitest';
import {classifyFixtureCoverage,COVERAGE_STATUSES,type MarketFlags} from './fixture-coverage';
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
});
