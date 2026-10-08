import {describe,it,expect} from 'vitest';
import {matchOddsFixture,planUtcParseDefectRepair} from './matching';
import type {CanonicalOddsFixture,ProviderOddsFixture} from './types';
const canonical:CanonicalOddsFixture={id:'canonical',sport:'FOOTBALL',competitionId:'br',competition:'brasileirao-serie-a',kickoff:'2026-09-12T19:00:00Z',status:'SCHEDULED',homeId:'h',home:'Atlético Mineiro',awayId:'a',away:'Fluminense'};
const raw:ProviderOddsFixture={providerId:'provider',sport:'FOOTBALL',competition:'brasileirao-serie-a',providerCompetitionId:'325',kickoff:canonical.kickoff,status:'PREGAME',homeProviderId:'10',awayProviderId:'20',homeNames:['Atletico Mineiro MG','Atletico Mineiro'],awayNames:['Fluminense FC RJ','Fluminense']};
describe('safe odds fixture matching',()=>{
  it.each([
    ['liga-expansion-mx','Alebrijes de Oaxaca','Correcaminos UAT','Alebrijes de Oaxaca FC','CF Correcaminos UAT'],
    ['liga-expansion-mx','CA La Paz','Tepatitlán de Morelos','Club Atletico La Paz','Tepatitlan FC'],
    ['liga-expansion-mx','Morelia','Piratas','Atletico Morelia','Piratas Veracruz'],
    ['liga-expansion-mx','Universidad Guadalajara','Durango','Leones Negros UDEG','Alacranes de Durango'],
    ['liga-expansion-mx','Mineros de Zacatecas','Cancún','CD Mineros de Zacatecas','Cancun FC'],
    ['colombia-primera-a','Deportes Tolima','Fortaleza CEIF','CD Tolima','Fortaleza FC'],
    ['colombia-primera-a','Deportivo Pereira','Junior FC','Deportivo Pereira FC SA','CD Junior FC'],
    ['colombia-primera-a','Rionegro Águilas','Junior FC','Aguilas Doradas Rionegro','CD Junior FC'],
    ['colombia-primera-b','Atlético','Real Cartagena','Atletico FC Cali','Real Cartagena FC'],
    ['colombia-primera-b','Patriotas Boyacá','Real Cartagena','Boyaca Patriotas','Real Cartagena FC'],
    ['ligue-2','Grenoble Foot 38','Nancy','Grenoble Foot','Nancy Lorraine'],
    ['ligue-2','Laval','Sochaux','Stade Lavallois MFC','Sochaux Montbeliard'],
    ['ligue-2','Clermont','Nancy','Clermont Foot 63','Nancy Lorraine'],
    ['argentina-primera-division','Sarmiento','Racing Club','CA Sarmiento Junin','Racing Club Avellaneda'],
  ])('recovers reviewed P0 names in %s, never time-only, reversed or cross-competition matches',(competition,home,away,providerHome,providerAway)=>{
    const target={...canonical,competition,home,away};
    const provider={...raw,competition,homeNames:[providerHome],awayNames:[providerAway]};
    expect(matchOddsFixture(provider,[target],[]).fixture?.id).toBe(target.id);
    expect(matchOddsFixture({...provider,kickoff:'2026-09-13T19:00:00Z'},[target],[]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture(provider,[target,{...target,id:'other'}],[]).state).toBe('AMBIGUOUS');
    expect(matchOddsFixture({...provider,homeNames:provider.awayNames,awayNames:provider.homeNames},[target],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...provider,competition:'unknown'},[{...target,competition:'unknown'}],[]).state).toBe('TEAM_MISMATCH');
  });
  it.each([
    ['UCV Moquegua','Cienciano','CD Moquegua','Cienciano'],
    ['Atlético Grau','Los Chankas','Atletico Grau','Los Chankas CYC'],
    ['ADT','FC Cajamarca','Asociacion Deportiva Tarma','FC Cajamarca'],
    ['Comerciantes Unidos','ADC Juan Pablo II','Comerciantes Unidos','Juan Pablo II College'],
    ['UTC Cajamarca','Sporting Cristal','UTC de Cajamarca','Sporting Cristal'],
  ])('matches reviewed Liga 1 aliases for %s–%s without relaxing identity guards',(home,away,providerHome,providerAway)=>{
    const target={...canonical,competition:'peru-liga-1',home,away};
    const provider={...raw,competition:target.competition,providerCompetitionId:'406',homeNames:[providerHome],awayNames:[providerAway]};
    expect(matchOddsFixture(provider,[target],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...provider,kickoff:'2026-09-13T19:00:00Z'},[target],[]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture(provider,[target,{...target,id:'other'}],[]).state).toBe('AMBIGUOUS');
    expect(matchOddsFixture({...provider,homeNames:provider.awayNames,awayNames:provider.homeNames},[target],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...provider,competition:'copa-libertadores'},[{...target,competition:'copa-libertadores'}],[]).state).toBe('TEAM_MISMATCH');
  });
  it.each([
    ['brasileirao-serie-b','Goiás','Atlético GO','Goias','AC Goianiense GO'],
    ['la-liga-2','Ceuta','Real Sociedad II','AD Ceuta','Real Sociedad San Sebastian B'],
  ])('accepts reviewed P5 aliases only in %s with exact contextual identity', (competition,home,away,providerHome,providerAway)=>{
    const target={...canonical,competition,home,away};
    const provider={...raw,competition,homeNames:[providerHome],awayNames:[providerAway]};
    expect(matchOddsFixture(provider,[target],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...provider,kickoff:'2026-09-13T19:00:00Z'},[target],[]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture(provider,[target,{...target,id:'other'}],[]).state).toBe('AMBIGUOUS');
    expect(matchOddsFixture({...provider,homeNames:provider.awayNames,awayNames:provider.homeNames},[target],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...provider,competition:'la-liga'},[{...target,competition:'la-liga'}],[]).state).toBe('TEAM_MISMATCH');
  });
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
  it('matches Europa League with reviewed provider names only and never aliases bare Lyon or Leverkusen',()=>{
    const celta={...canonical,id:'omo-cel',competition:'europa-league',home:'Omonia Nicosia',away:'Celta de Vigo'};
    const sparta={...canonical,id:'ara-spa',competition:'europa-league',home:'Ararat-Armenia',away:'Sparta Praha'};
    const lever={...canonical,id:'lev-cel',competition:'europa-league',home:'Bayer 04 Leverkusen',away:'Celje'};
    const lyon={...canonical,id:'and-lyo',competition:'europa-league',home:'Anderlecht',away:'Olympique Lyonnais'};
    const rennes={...canonical,id:'stu-ren',competition:'europa-league',home:'Sturm Graz',away:'Rennes'};
    const milan={...canonical,id:'mil-ben',competition:'europa-league',home:'AC Milan',away:'Benfica'};
    const olymp={...canonical,id:'oly-jag',competition:'europa-league',home:'Olympiacos F.C.',away:'Jagiellonia Białystok'};
    const beer={...canonical,id:'hap-din',competition:'europa-league',home:"Hapoel Be'er Sheva",away:'Dinamo Zagreb'};
    const ofi={...canonical,id:'ofi-hof',competition:'europa-league',home:'OFI',away:'TSG Hoffenheim'};
    const lill={...canonical,id:'lil-tor',competition:'europa-league',home:'Lillestrøm',away:'Torreense'};
    const plzen={...canonical,id:'vik-usg',competition:'europa-league',home:'Viktoria Plzeň',away:'Union Saint-Gilloise'};
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['AC Omonia Nicosia','Omonia Nicosia'],awayNames:['RC Celta de Vigo','Celta Vigo']},[celta],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['FC Ararat-Armenia','Ararat-Armenia'],awayNames:['Sparta Prague']},[sparta],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['Bayer Leverkusen'],awayNames:['NK Celje']},[lever],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['Leverkusen'],awayNames:['NK Celje']},[lever],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['RSC Anderlecht','Anderlecht'],awayNames:['Olympique Lyon']},[lyon],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['Anderlecht'],awayNames:['Lyon']},[lyon],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['SK Sturm Graz','Sturm Graz'],awayNames:['Stade Rennais FC','Stade Rennais']},[rennes],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['AC Milan','Milan'],awayNames:['SL Benfica']},[milan],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['Olympiacos Piraeus','Olympiacos'],awayNames:['Jagiellonia Bialystok','Jagiellonia']},[olymp],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:["Hapoel Be`er Sheva FC"],awayNames:['GNK Dinamo Zagreb','Dinamo Zagreb']},[beer],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['OFI Crete'],awayNames:['TSG Hoffenheim']},[ofi],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['Lillestroem SK','Lillestroem'],awayNames:['SCU Torreense','Torreense']},[lill],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'europa-league',homeNames:['FC Viktoria Plzen'],awayNames:['Union Saint-Gilloise']},[plzen],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...milan,kickoff:'2026-09-12T15:00:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'europa-league',kickoff:'2026-09-12T19:00:00Z',homeNames:['AC Milan'],awayNames:['SL Benfica']},[late])).toEqual({fixtureId:'mil-ben',before:'2026-09-12T15:00:00Z',after:'2026-09-12T19:00:00Z'});
  });
  it('matches Copa Sudamericana Independiente Santa Fe without aliasing bare Independiente',()=>{
    const vasco={...canonical,id:'vas-sfe',competition:'copa-sudamericana',home:'Vasco da Gama',away:'Santa Fe'};
    const sp={...canonical,id:'sao-boc',competition:'copa-sudamericana',home:'São Paulo',away:'Boca Juniors'};
    expect(matchOddsFixture({...raw,competition:'copa-sudamericana',homeNames:['CR Vasco da Gama RJ','Vasco da Gama'],awayNames:['Independiente Santa Fe','Independ. Santa Fe']},[vasco],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'copa-sudamericana',homeNames:['Vasco da Gama'],awayNames:['Independiente']},[vasco],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'copa-sudamericana',homeNames:['Sao Paulo FC SP','Sao Paulo'],awayNames:['Boca Juniors']},[sp],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...vasco,kickoff:'2026-09-12T18:00:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'copa-sudamericana',kickoff:'2026-09-12T22:00:00Z',homeNames:['Vasco da Gama'],awayNames:['Independiente Santa Fe']},[late])).toEqual({fixtureId:'vas-sfe',before:'2026-09-12T18:00:00Z',after:'2026-09-12T22:00:00Z'});
  });
  it('matches MLS with reviewed provider names only and never aliases bare New York or Miami',()=>{
    const nyc={...canonical,id:'nyc-rb',competition:'mls',home:'New York City',away:'New York RB'};
    const sj={...canonical,id:'sj-lafc',competition:'mls',home:'SJ Earthquakes',away:'Los Angeles FC'};
    const stl={...canonical,id:'stl-tor',competition:'mls',home:'St. Louis City',away:'Toronto'};
    const mia={...canonical,id:'mia-sd',competition:'mls',home:'Inter Miami',away:'San Diego'};
    const van={...canonical,id:'van-aus',competition:'mls',home:'Vancouver Whitecaps',away:'Austin'};
    const skc={...canonical,id:'skc-phi',competition:'mls',home:'Sporting KC',away:'Philadelphia Union'};
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['New York City FC','New York City'],awayNames:['New York Red Bulls']},[nyc],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['New York City'],awayNames:['New York']},[nyc],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['San Jose Earthquakes'],awayNames:['Los Angeles FC','LAFC']},[sj],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['San Jose'],awayNames:['LAFC']},[sj],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['Saint Louis City SC'],awayNames:['Toronto FC','Toronto']},[stl],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['Inter Miami CF'],awayNames:['San Diego FC','San Diego']},[mia],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['Miami'],awayNames:['San Diego']},[mia],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['Vancouver Whitecaps FC'],awayNames:['Austin FC','Austin']},[van],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'mls',homeNames:['Sporting Kansas City'],awayNames:['Philadelphia Union']},[skc],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...van,kickoff:'2026-09-13T18:30:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'mls',kickoff:'2026-09-13T22:30:00Z',homeNames:['Vancouver Whitecaps FC'],awayNames:['Austin']},[late])).toEqual({fixtureId:'van-aus',before:'2026-09-13T18:30:00Z',after:'2026-09-13T22:30:00Z'});
  });
  it('matches Ligue 1 with reviewed names only and never aliases bare Lyon or Lille',()=>{
    const lyon={...canonical,id:'lyo-ren',competition:'ligue-1',home:'Olympique Lyonnais',away:'Rennes'};
    const lille={...canonical,id:'nic-lil',competition:'ligue-1',home:'Nice',away:'LOSC Lille'};
    const stras={...canonical,id:'par-str',competition:'ligue-1',home:'Paris',away:'Strasbourg'};
    const aux={...canonical,id:'aux-bre',competition:'ligue-1',home:'Auxerre',away:'Brest'};
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['Olympique Lyon'],awayNames:['Stade Rennais FC','Stade Rennais']},[lyon],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['Lyon'],awayNames:['Rennes']},[lyon],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['OGC Nice','Nice'],awayNames:['Lille OSC']},[lille],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['Nice'],awayNames:['Lille']},[lille],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['Paris FC','Paris'],awayNames:['Strasbourg Alsace']},[stras],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'ligue-1',homeNames:['AJ Auxerre','Auxerre'],awayNames:['Stade Brest 29']},[aux],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...lyon,kickoff:'2026-09-12T14:45:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'ligue-1',kickoff:'2026-09-12T18:45:00Z',homeNames:['Olympique Lyon'],awayNames:['Stade Rennais']},[late])).toEqual({fixtureId:'lyo-ren',before:'2026-09-12T14:45:00Z',after:'2026-09-12T18:45:00Z'});
  });
  it('matches Liga Portugal with reviewed names only and never aliases bare Braga',()=>{
    const braga={...canonical,id:'bra-est',competition:'liga-portugal',home:'Sporting Braga',away:'Estoril'};
    const mar={...canonical,id:'mor-mar',competition:'liga-portugal',home:'Moreirense',away:'Marítimo'};
    expect(matchOddsFixture({...raw,competition:'liga-portugal',homeNames:['SC Braga'],awayNames:['Estoril Praia','Estoril']},[braga],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'liga-portugal',homeNames:['Braga'],awayNames:['Estoril']},[braga],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'liga-portugal',homeNames:['Moreirense FC','Moreirense'],awayNames:['Maritimo Madeira']},[mar],[]).state).toBe('HIGH_CONFIDENCE');
    const guimaraes={...canonical,id:'vim-mor',competition:'liga-portugal',home:'Vitória Guimarães',away:'Moreirense',kickoff:'2026-09-20T14:30:00Z'};
    const viseu={...canonical,id:'est-vis',competition:'liga-portugal',home:'Estrela Amadora',away:'Academico Viseu',kickoff:'2026-09-20T14:30:00Z'};
    expect(matchOddsFixture({...raw,competition:'liga-portugal',kickoff:guimaraes.kickoff,homeNames:['Vitoria SC Guimaraes','Guimaraes'],awayNames:['Moreirense FC','Moreirense']},[guimaraes],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'liga-portugal',kickoff:guimaraes.kickoff,homeNames:['Guimaraes'],awayNames:['Moreirense']},[guimaraes],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'liga-portugal',kickoff:viseu.kickoff,homeNames:['Estrela Amadora'],awayNames:['Academico de Viseu FC','Viseu']},[viseu],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'liga-portugal',kickoff:viseu.kickoff,homeNames:['Estrela Amadora'],awayNames:['Viseu']},[viseu],[]).state).toBe('TEAM_MISMATCH');
    const late={...braga,kickoff:'2026-09-12T15:45:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'liga-portugal',kickoff:'2026-09-12T19:45:00Z',homeNames:['SC Braga'],awayNames:['Estoril']},[late])).toEqual({fixtureId:'bra-est',before:'2026-09-12T15:45:00Z',after:'2026-09-12T19:45:00Z'});
  });
  it('matches Eredivisie Twente and PSV from provider names without aliasing bare Eindhoven',()=>{
    const twente={...canonical,id:'twe-psv',competition:'eredivisie',home:'FC Twente',away:'PSV'};
    const ajax={...canonical,id:'aja-wil',competition:'eredivisie',home:'Ajax',away:'Willem II'};
    expect(matchOddsFixture({...raw,competition:'eredivisie',homeNames:['FC Twente Enschede'],awayNames:['PSV Eindhoven']},[twente],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'eredivisie',homeNames:['Enschede'],awayNames:['Eindhoven']},[twente],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'eredivisie',homeNames:['Ajax Amsterdam','Ajax'],awayNames:['Willem II Tilburg','Willem II']},[ajax],[]).state).toBe('HIGH_CONFIDENCE');
    const late={...ajax,kickoff:'2026-09-12T14:00:00Z'};
    expect(planUtcParseDefectRepair({...raw,competition:'eredivisie',kickoff:'2026-09-12T18:00:00Z',homeNames:['Ajax'],awayNames:['Willem II']},[late])).toEqual({fixtureId:'aja-wil',before:'2026-09-12T14:00:00Z',after:'2026-09-12T18:00:00Z'});
  });
  it('matches Liga MX Tijuana from the stored Club Tijuana de Caliente provider name',()=>{
    const pachuca={...canonical,id:'pachuca-tijuana',competition:'liga-mx',home:'Pachuca',away:'Tijuana',kickoff:'2026-09-21T00:00:00Z'};
    const provider={...raw,competition:'liga-mx',providerCompetitionId:'27464',kickoff:pachuca.kickoff,homeNames:['CF Pachuca','Pachuca'],awayNames:['Club Tijuana de Caliente','Tijuana de Caliente']};
    expect(matchOddsFixture(provider,[pachuca],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...provider,awayNames:['Tijuana FC']},[pachuca],[]).state).toBe('TEAM_MISMATCH');
  });
  it('matches Champions League reviewed provider names without aliasing bare city clubs',()=>{
    const lille={...canonical,id:'ars-lil',competition:'champions-league',home:'Arsenal',away:'LOSC Lille',kickoff:'2026-10-13T19:00:00Z'};
    const glimt={...canonical,id:'bodo-dor',competition:'champions-league',home:'Bodø / Glimt',away:'Borussia Dortmund',kickoff:'2026-10-14T19:00:00Z'};
    expect(matchOddsFixture({...raw,competition:'champions-league',kickoff:lille.kickoff,homeNames:['Arsenal FC','Arsenal'],awayNames:['Lille OSC','Lille']},[lille],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'champions-league',kickoff:lille.kickoff,homeNames:['Arsenal'],awayNames:['Lille']},[lille],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'champions-league',kickoff:glimt.kickoff,homeNames:['Bodoe/Glimt'],awayNames:['Borussia Dortmund','Dortmund']},[glimt],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'champions-league',kickoff:glimt.kickoff,homeNames:['Glimt'],awayNames:['Dortmund']},[glimt],[]).state).toBe('TEAM_MISMATCH');
  });
  it('matches Argentina Primera reviewed provider names without aliasing bare city clubs',()=>{
    const riestra={...canonical,id:'rie-lan',competition:'argentina-primera-division',home:'Deportivo Riestra',away:'Lanús',kickoff:'2026-09-14T22:00:00Z'};
    const independiente={...canonical,id:'uni-ind',competition:'argentina-primera-division',home:'Unión Santa Fe',away:'Independiente',kickoff:'2026-09-19T19:45:00Z'};
    const rivadavia={...canonical,id:'bar-riv',competition:'argentina-primera-division',home:'Barracas Central',away:'Independiente Rivadavia',kickoff:'2026-09-21T22:00:00Z'};
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:riestra.kickoff,homeNames:['Deportivo Riestra AFBC'],awayNames:['CA Lanus','Lanus']},[riestra],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:riestra.kickoff,homeNames:['Riestra'],awayNames:['Lanus']},[riestra],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:independiente.kickoff,homeNames:['Union de Santa Fe','Union Santa Fe'],awayNames:['CA Independiente Avellaneda']},[independiente],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:rivadavia.kickoff,homeNames:['CA Barracas Central'],awayNames:['Independiente Rivadavia']},[rivadavia],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:rivadavia.kickoff,homeNames:['Barracas'],awayNames:['Rivadavia']},[rivadavia],[]).state).toBe('TEAM_MISMATCH');
    const rioCuarto={...canonical,id:'ins-erc',competition:'argentina-primera-division',home:'Instituto',away:'Estudiantes de Río Cuarto',kickoff:'2026-09-15T00:15:00Z'};
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:rioCuarto.kickoff,homeNames:['Instituto AC Cordoba'],awayNames:['Estudiantes Rio Cuarto']},[rioCuarto],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'argentina-primera-division',kickoff:rioCuarto.kickoff,homeNames:['Instituto'],awayNames:['Rio Cuarto']},[rioCuarto],[]).state).toBe('TEAM_MISMATCH');
  });
  it('matches Serie B, Coppa Italia and Super Lig reviewed provider names without city shortcuts',()=>{
    const vicenza={...canonical,id:'ver-vic',competition:'serie-b-italy',home:'Hellas Verona',away:'Vicenza',kickoff:'2026-09-20T13:00:00Z'};
    const sudtirol={...canonical,id:'gen-sud',competition:'coppa-italia',home:'Genoa',away:'Südtirol',kickoff:'2026-09-15T16:00:00Z'};
    const kasimpasa={...canonical,id:'kas-kon',competition:'super-lig',home:'Kasımpaşa',away:'Konyaspor',kickoff:'2026-09-18T17:00:00Z'};
    expect(matchOddsFixture({...raw,competition:'serie-b-italy',kickoff:vicenza.kickoff,homeNames:['Hellas Verona'],awayNames:['L.R. Vicenza']},[vicenza],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'coppa-italia',kickoff:sudtirol.kickoff,homeNames:['Genoa CFC','Genoa'],awayNames:['FC Sudtirol Bolzano']},[sudtirol],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'coppa-italia',kickoff:sudtirol.kickoff,homeNames:['Genoa'],awayNames:['Bolzano']},[sudtirol],[]).state).toBe('TEAM_MISMATCH');
    expect(matchOddsFixture({...raw,competition:'super-lig',kickoff:kasimpasa.kickoff,homeNames:['Kasimpasa Istanbul','Kasimpasa'],awayNames:['Konyaspor']},[kasimpasa],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture({...raw,competition:'super-lig',kickoff:kasimpasa.kickoff,homeNames:['Istanbul'],awayNames:['Konyaspor']},[kasimpasa],[]).state).toBe('TEAM_MISMATCH');
  });
  it('matches Championship names without extra aliases and repairs the proven +4h kickoff defect',()=>{
    const derby={...canonical,id:'lei-cov',competition:'championship',home:'Leicester City',away:'Coventry City',kickoff:'2026-09-12T14:00:00Z'};
    expect(matchOddsFixture({...raw,competition:'championship',kickoff:'2026-09-12T18:00:00Z',homeNames:['Leicester City','Leicester'],awayNames:['Coventry City','Coventry']},[{...derby,kickoff:'2026-09-12T18:00:00Z'}],[]).state).toBe('HIGH_CONFIDENCE');
    expect(planUtcParseDefectRepair({...raw,competition:'championship',kickoff:'2026-09-12T18:00:00Z',homeNames:['Leicester City'],awayNames:['Coventry City']},[derby])).toEqual({fixtureId:'lei-cov',before:'2026-09-12T14:00:00Z',after:'2026-09-12T18:00:00Z'});
  });
  it('reconciles a rescheduled fixture instead of dropping every price for it (production: 4 Liga MX fixtures × 4 books)',()=>{
    const saved={providerId:'provider',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20',canonicalKickoff:canonical.kickoff,providerKickoff:raw.kickoff};
    expect(matchOddsFixture(raw,[canonical],[saved]).state).toBe('EXACT');
    // Provider and canonical now agree on a new time; only the stored mapping is historical.
    const moved='2026-09-12T19:05:00Z';
    const both=matchOddsFixture({...raw,kickoff:moved},[{...canonical,kickoff:moved}],[saved]);
    expect(both.state).toBe('EXACT');expect(both.fixture?.id).toBe('canonical');
    expect(both.reason).toMatch(/reconciled/);
    // One side alone still resolves, because the two times stay inside the discovery tolerance.
    expect(matchOddsFixture({...raw,kickoff:moved},[canonical],[saved]).fixture?.id).toBe('canonical');
    expect(matchOddsFixture(raw,[{...canonical,kickoff:moved}],[saved]).fixture?.id).toBe('canonical');
  });
  it('still refuses a move beyond the kickoff tolerance and never follows a changed team identity',()=>{
    const saved={providerId:'provider',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20',canonicalKickoff:canonical.kickoff,providerKickoff:raw.kickoff};
    const far='2026-09-12T22:00:00Z';
    expect(matchOddsFixture({...raw,kickoff:far},[canonical],[saved]).state).toBe('TIME_MISMATCH');
    expect(matchOddsFixture({...raw,kickoff:far},[canonical],[saved]).fixture).toBeNull();
    expect(matchOddsFixture({...raw,homeProviderId:'99'},[canonical],[saved]).state).toBe('TEAM_MISMATCH');
    // A reschedule must not let a provider event steal a fixture another identity already owns.
    const other={providerId:'other',fixtureId:'canonical',homeProviderId:'10',awayProviderId:'20'};
    expect(matchOddsFixture({...raw,kickoff:'2026-09-12T19:05:00Z'},[canonical],[saved,other]).state).toBe('AMBIGUOUS');
  });
  it('maps a later matchweek automatically when names and kickoff uniquely match, and never maps ambiguous twins',()=>{
    const later={...canonical,id:'week2',kickoff:'2026-10-12T19:00:00Z'};
    const provider={...raw,providerId:'later-week',kickoff:later.kickoff};
    expect(matchOddsFixture(provider,[canonical,later],[]).state).toBe('HIGH_CONFIDENCE');
    expect(matchOddsFixture(provider,[canonical,later],[]).fixture?.id).toBe('week2');
    expect(matchOddsFixture(provider,[later,{...later,id:'twin'}],[]).state).toBe('AMBIGUOUS');
    expect(matchOddsFixture(provider,[later,{...later,id:'twin'}],[]).fixture).toBeNull();
  });
});
