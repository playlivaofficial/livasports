import {describe,it,expect} from 'vitest';
import {matchOddsFixture} from './matching';
import type {CanonicalOddsFixture,ProviderOddsFixture} from './types';
const canonical:CanonicalOddsFixture={id:'canonical',sport:'FOOTBALL',competitionId:'br',competition:'brasileirao-serie-a',kickoff:'2026-09-12T19:00:00Z',status:'SCHEDULED',homeId:'h',home:'Atlético Mineiro',awayId:'a',away:'Fluminense'};
const raw:ProviderOddsFixture={providerId:'provider',sport:'FOOTBALL',competition:'brasileirao-serie-a',providerCompetitionId:'325',kickoff:canonical.kickoff,status:'PREGAME',homeProviderId:'10',awayProviderId:'20',homeNames:['Atletico Mineiro MG','Atletico Mineiro'],awayNames:['Fluminense FC RJ','Fluminense']};
describe('safe odds fixture matching',()=>{
  it('requires all contextual identity signals, then revalidates persistent identities',()=>{
    expect(matchOddsFixture(raw,[canonical],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture(raw,[canonical],[{providerId:'provider',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20'}]).state).toBe('EXACT');
  });
  it.each(['2026-09-12T15:00:00Z','2026-09-13T19:00:00Z'])('rejects timezone defects/reschedules %s',kickoff=>{
    expect(matchOddsFixture({...raw,kickoff},[canonical],[]).state).toBe('TIME_MISMATCH');
  });
  it('does not guess reversed teams, wrong competitions, different sports or similar names',()=>{
    expect(matchOddsFixture({...raw,homeNames:raw.awayNames,awayNames:raw.homeNames},[canonical],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'serie-a-italy'},[canonical],[]).state).toBe('COMPETITION_MISMATCH');
    expect(matchOddsFixture({...raw,sport:'BASKETBALL'},[canonical],[]).state).toBe('COMPETITION_MISMATCH');
    expect(matchOddsFixture({...raw,homeNames:['Atletico']},[canonical],[]).state).toBe('TEAM_MISMATCH');
  });
  it('rejects ambiguous candidates and competing provider identities',()=>{
    expect(matchOddsFixture(raw,[canonical,{...canonical,id:'second'}],[]).state).toBe('AMBIGUOUS');
    expect(matchOddsFixture(raw,[canonical],[{providerId:'another',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20'}]).state).toBe('AMBIGUOUS');
  });
  it('allows a documented small difference but never ignores a changed persisted team identity',()=>{
    expect(matchOddsFixture({...raw,kickoff:'2026-09-12T19:05:00Z'},[canonical],[]).fixture?.id).toBe('canonical');
    expect(matchOddsFixture(raw,[canonical],[{providerId:'provider',fixtureId:'canonical',homeProviderId:'99',awayProviderId:'20'}]).state).toBe('TEAM_MISMATCH');
  });
  it('uses tolerance only for discovery, never to hide a change to an established kickoff',()=>{
    const saved={providerId:'provider',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20',canonicalKickoff:canonical.kickoff,providerKickoff:raw.kickoff};
    expect(matchOddsFixture(raw,[canonical],[saved]).state).toBe('EXACT');
    expect(matchOddsFixture({...raw,kickoff:'2026-09-12T19:05:00Z'},[canonical],[saved]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture(raw,[{...canonical,kickoff:'2026-09-12T19:05:00Z'}],[saved]).state).toBe('TIME_MISMATCH');
  });
});
