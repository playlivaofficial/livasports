import {describe,expect,it} from 'vitest';
import {coverageGapCode,unmappedFixtureReason} from './coverage-matrix';
import type {CanonicalOddsFixture,ProviderOddsFixture} from './types';

const fixture:CanonicalOddsFixture={id:'mx1',sport:'FOOTBALL',competitionId:'mx',competition:'liga-mx',kickoff:'2026-09-18T02:00:00Z',status:'SCHEDULED',homeId:'h',home:'Puebla',awayId:'a',away:'Atlante'};
const raw=(overrides:Partial<ProviderOddsFixture>={}):ProviderOddsFixture=>({providerId:'p',sport:'FOOTBALL',competition:'liga-mx',providerCompetitionId:'27464',kickoff:'2026-09-14T02:00:00Z',status:'PREGAME',homeProviderId:'1',awayProviderId:'2',homeNames:['America'],awayNames:['Tigres'],...overrides});

describe('strict unmapped fixture reasons',()=>{
  it('reports provider absence, kickoff mismatch, team mismatch and duplicates without loosening identity',()=>{
    expect(unmappedFixtureReason(fixture,[])).toBe('provider fixture absent');
    expect(unmappedFixtureReason(fixture,[raw()])).toBe('provider fixture absent');
    expect(unmappedFixtureReason(fixture,[raw({kickoff:fixture.kickoff,homeNames:['Puebla'],awayNames:['Club America']})])).toBe('team mismatch');
    expect(unmappedFixtureReason(fixture,[raw({homeNames:['Puebla'],awayNames:['Atlante']})])).toBe('kickoff mismatch');
    expect(unmappedFixtureReason(fixture,[
      raw({providerId:'a',kickoff:fixture.kickoff,homeNames:['Puebla'],awayNames:['Atlante']}),
      raw({providerId:'b',kickoff:fixture.kickoff,homeNames:['Puebla'],awayNames:['Atlante']}),
    ])).toBe('duplicate candidate');
    expect(coverageGapCode('provider fixture absent')).toBe('ODDSPAPI_FIXTURE_ABSENT');
    expect(coverageGapCode('provider fixture absent',{tournamentActive:false})).toBe('TOURNAMENT_NOT_ACTIVE');
    expect(coverageGapCode('team mismatch')).toBe('TEAM_ALIAS_MISMATCH');
    expect(coverageGapCode('kickoff mismatch')).toBe('KICKOFF_MISMATCH');
    expect(coverageGapCode('mapping missing for another reason')).toBe('FIXTURE_MAPPING_MISSING');
    expect(coverageGapCode('',{readModelDropped:true})).toBe('QUOTE_DROPPED_BY_READ_MODEL');
    expect(coverageGapCode('',{stale:true})).toBe('QUOTE_STALE');
  });
});
