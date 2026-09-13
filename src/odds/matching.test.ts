import {describe,it,expect} from 'vitest';
import {matchOddsFixture,planUtcParseDefectRepair} from './matching';
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
  it('matches Brasileirão Série B with the same strict identity rules as Série A',()=>{
    const b={...canonical,id:'serie-b',competition:'brasileirao-serie-b',home:'Goiás',away:'Sport Recife'};
    const provider={...raw,competition:'brasileirao-serie-b',providerCompetitionId:'390',homeNames:['Goias EC GO','Goias'],awayNames:['SC Recife PE','Sport Recife']};
    expect(matchOddsFixture(provider,[b],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...provider,kickoff:'2026-09-12T21:00:00Z'},[b],[]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture({...provider,competition:'brasileirao-serie-a'},[b],[]).state).toBe('COMPETITION_MISMATCH');
    const athletic={...canonical,id:'athletic',competition:'brasileirao-serie-b',home:'Juventude',away:'Athletic Club'};
    expect(matchOddsFixture({...raw,competition:'brasileirao-serie-b',homeNames:['EC Juventude RS','Juventude RS'],awayNames:['Athletic Club Sjdr MG','Athletic Club Sjdr']},[athletic],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'brasileirao-serie-b',homeNames:['Nautico'],awayNames:['Ferroviario']},[{...canonical,id:'op',competition:'brasileirao-serie-b',home:'Náutico',away:'Operário PR'}],[]).state).toBe('TEAM_MISMATCH');
    const late={...athletic,kickoff:'2026-09-12T15:00:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'brasileirao-serie-b',kickoff:'2026-09-12T19:00:00Z',homeNames:['Juventude RS'],awayNames:['Athletic Club Sjdr']},[late])).toEqual({fixtureId:'athletic',before:'2026-09-12T15:00:00Z',after:'2026-09-12T19:00:00Z'});
    expect(planUtcParseDefectRepair({...raw,competition:'brasileirao-serie-b',kickoff:'2026-09-12T19:05:00Z',homeNames:['Juventude RS'],awayNames:['Athletic Club Sjdr']},[late])).toBeNull();
  });
  it('matches La Liga with reviewed names only and never aliases bare Deportivo or Atlético',()=>{
    const madrid={...canonical,id:'atm-osa',competition:'la-liga',home:'Atlético de Madrid',away:'Osasuna'};
    const depor={...canonical,id:'dep-sev',competition:'la-liga',home:'Deportivo A Coruña',away:'Sevilla'};
    const athletic={...canonical,id:'lev-ath',competition:'la-liga',home:'Levante',away:'Athletic Club'};
    const celta={...canonical,id:'cel-rac',competition:'la-liga',home:'Celta de Vigo',away:'Racing Santander'};
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['Atletico Madrid','Atletico'],awayNames:['CA Osasuna','Osasuna']},[madrid],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['Atletico'],awayNames:['Osasuna']},[madrid],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['RC Deportivo de A Coruna','Deportivo'],awayNames:['Sevilla FC','Sevilla']},[depor],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['Deportivo'],awayNames:['Sevilla']},[depor],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['Levante UD','Levante'],awayNames:['Athletic Bilbao','Bilbao']},[athletic],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'la-liga',homeNames:['RC Celta de Vigo','Celta Vigo'],awayNames:['Racing Santander','Santander']},[celta],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...madrid,kickoff:'2026-09-12T15:00:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'la-liga',kickoff:'2026-09-12T19:00:00Z',homeNames:['Atletico Madrid'],awayNames:['Osasuna']},[late])).toEqual({fixtureId:'atm-osa',before:'2026-09-12T15:00:00Z',after:'2026-09-12T19:00:00Z'});
  });
  it('matches Bundesliga with reviewed names only and never aliases bare Mainz or Leverkusen',()=>{
    const bayern={...canonical,id:'bay-uni',competition:'bundesliga',home:'FC Bayern München',away:'FC Union Berlin'};
    const mainz={...canonical,id:'gla-mai',competition:'bundesliga',home:'Borussia Mönchengladbach',away:'FSV Mainz 05'};
    const cologne={...canonical,id:'hsv-kol',competition:'bundesliga',home:'Hamburger SV',away:'FC Köln'};
    const lever={...canonical,id:'lev-rbl',competition:'bundesliga',home:'Bayer 04 Leverkusen',away:'RB Leipzig'};
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Bayern Munich'],awayNames:['Union Berlin']},[bayern],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Borussia Monchengladbach'],awayNames:['FSV Mainz']},[mainz],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Borussia Monchengladbach'],awayNames:['Mainz']},[mainz],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Hamburger SV'],awayNames:['1. FC Cologne']},[cologne],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Bayer Leverkusen'],awayNames:['RB Leipzig']},[lever],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'bundesliga',homeNames:['Leverkusen'],awayNames:['RB Leipzig']},[lever],[]).state).toBe('TEAM_MISMATCH');
  });
  it('matches Serie A Italy Parma as Parma Calcio without suffix stripping',()=>{
    const parma={...canonical,id:'com-par',competition:'serie-a-italy',home:'Como',away:'Parma'};
    expect(matchOddsFixture({...raw,competition:'serie-a-italy',homeNames:['Como 1907','Como'],awayNames:['Parma Calcio']},[parma],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'serie-a-italy',homeNames:['Como'],awayNames:['Parma Calcio 1913']},[parma],[]).state).toBe('TEAM_MISMATCH');
  });
  it('uses tolerance only for discovery, never to hide a change to an established kickoff',()=>{
    const saved={providerId:'provider',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20',canonicalKickoff:canonical.kickoff,providerKickoff:raw.kickoff};
    expect(matchOddsFixture(raw,[canonical],[saved]).state).toBe('EXACT');
    expect(matchOddsFixture({...raw,kickoff:'2026-09-12T19:05:00Z'},[canonical],[saved]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture(raw,[{...canonical,kickoff:'2026-09-12T19:05:00Z'}],[saved]).state).toBe('TIME_MISMATCH');
  });
});
