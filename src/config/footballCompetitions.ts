import { CompetitionType, TeamType } from '@/domain/enums';
import {competitionDemand,CORE_GEOS,type CoreGeo} from './geo';

export type ProductGeo = 'BR' | 'ROW' | CoreGeo;
export type CompetitionRegion = 'EUROPE' | 'SOUTH_AMERICA' | 'NORTH_AMERICA' | 'MIDDLE_EAST' | 'GLOBAL';
export type CompetitionGroup = 'BRAZIL' | 'EUROPE' | 'AMERICAS' | 'INTERNATIONAL' | 'OTHER';
export type SeasonStrategy = 'STANDARD' | 'SPLIT' | 'EDITION' | 'CYCLE';

export interface FootballCompetitionTarget {
  key: string;
  slug: string;
  canonicalName: string;
  displayNames: Readonly<Record<'br' | 'mx', string>>;
  type: CompetitionType;
  region: CompetitionRegion;
  group: CompetitionGroup;
  countryCode: string | null;
  countryNames: readonly string[];
  lookupNames: readonly string[];
  enabled: boolean;
  automatic?: boolean;
  /** Retired inventory keeps its canonical URL/history but is excluded from new acquisition and ingestion. */
  approvedInventory?: boolean;
  parentSlug?: string;
  sportmonksId?: number;
  priority: Readonly<Record<'br' | 'mx', number>>;
  geoRelevance: readonly ProductGeo[];
  seasonStrategy: SeasonStrategy;
  teamType: TeamType;
}

const historicalOnly = new Set(['ligue-2','serie-b-italy','super-lig','brasileirao-serie-b','paulista-a1','carioca-serie-a','copa-do-nordeste','uefa-super-cup']);
/** Read-only subscribed catalog verified 2026-10-04. IDs are immutable identities, not inferred from names. */
export const VERIFIED_SPORTMONKS_IDS:Readonly<Record<string,number>>={
  'champions-league':2,'europa-league':5,'premier-league':8,championship:9,'fa-cup':24,'carabao-cup':27,
  eredivisie:72,bundesliga:82,'ligue-1':301,'serie-a-italy':384,'coppa-italia':390,'liga-portugal':462,
  'la-liga':564,'la-liga-2':567,'copa-del-rey':570,'argentina-primera-division':636,'brasileirao-serie-a':648,
  'copa-do-brasil':654,'colombia-primera-a':672,'colombia-primera-b':678,'copa-colombia':681,'liga-mx':743,
  'liga-expansion-mx':749,'peru-liga-1':764,'peru-liga-2':767,mls:779,'saudi-pro-league':944,
  'concacaf-champions-cup':1111,'copa-sudamericana':1116,'copa-libertadores':1122,
  'saudi-pro-league-playoffs':1678,'conference-league':2286,'leagues-cup':3211,
};
const target = (value: FootballCompetitionTarget): FootballCompetitionTarget => ({...value,
  sportmonksId:VERIFIED_SPORTMONKS_IDS[value.slug],
  approvedInventory:!historicalOnly.has(value.slug),
  ...(value.slug==='saudi-pro-league-playoffs'?{parentSlug:'saudi-pro-league'}:{}),
  geoRelevance:CORE_GEOS,
  priority:{br:100,mx:100-competitionDemand('MX',value.slug)},
});

export const FOOTBALL_COMPETITION_TARGETS: readonly FootballCompetitionTarget[] = [
  target({ key: 'eng-premier-league', slug: 'premier-league', canonicalName: 'Premier League', displayNames: { br: 'Premier League', mx: 'Premier League' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'GB', countryNames: ['England'], lookupNames: ['Premier League', 'English Premier League'], enabled: true, priority: { br: 90, mx: 50 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'eng-championship', slug: 'championship', canonicalName: 'Championship', displayNames: { br: 'Championship', mx: 'Championship' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'GB', countryNames: ['England'], lookupNames: ['Championship', 'EFL Championship'], enabled: true, priority: { br: 240, mx: 190 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'eng-fa-cup', slug: 'fa-cup', canonicalName: 'FA Cup', displayNames: { br: 'FA Cup', mx: 'FA Cup' }, type: CompetitionType.DOMESTIC_CUP, region: 'EUROPE', group: 'EUROPE', countryCode: 'GB', countryNames: ['England'], lookupNames: ['FA Cup'], enabled: true, priority: { br: 250, mx: 200 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'eng-carabao-cup', slug: 'carabao-cup', canonicalName: 'Carabao Cup', displayNames: { br: 'Carabao Cup', mx: 'Carabao Cup' }, type: CompetitionType.DOMESTIC_CUP, region: 'EUROPE', group: 'EUROPE', countryCode: 'GB', countryNames: ['England'], lookupNames: ['Carabao Cup', 'League Cup', 'EFL Cup'], enabled: true, priority: { br: 260, mx: 210 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'deu-bundesliga', slug: 'bundesliga', canonicalName: 'Bundesliga', displayNames: { br: 'Bundesliga', mx: 'Bundesliga' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'DE', countryNames: ['Germany'], lookupNames: ['Bundesliga'], enabled: true, priority: { br: 120, mx: 150 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'fra-ligue-1', slug: 'ligue-1', canonicalName: 'Ligue 1', displayNames: { br: 'Ligue 1', mx: 'Ligue 1' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'FR', countryNames: ['France'], lookupNames: ['Ligue 1'], enabled: true, priority: { br: 130, mx: 220 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'fra-ligue-2', slug: 'ligue-2', canonicalName: 'Ligue 2', displayNames: { br: 'Ligue 2', mx: 'Ligue 2' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'FR', countryNames: ['France'], lookupNames: ['Ligue 2'], enabled: true, priority: { br: 270, mx: 230 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'ita-serie-a', slug: 'serie-a-italy', canonicalName: 'Serie A (Italy)', displayNames: { br: 'Serie A Italiana', mx: 'Serie A de Italia' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'IT', countryNames: ['Italy'], lookupNames: ['Serie A'], enabled: true, priority: { br: 110, mx: 140 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'ita-serie-b', slug: 'serie-b-italy', canonicalName: 'Serie B (Italy)', displayNames: { br: 'Serie B Italiana', mx: 'Serie B de Italia' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'IT', countryNames: ['Italy'], lookupNames: ['Serie B'], enabled: true, priority: { br: 280, mx: 240 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'ita-coppa-italia', slug: 'coppa-italia', canonicalName: 'Coppa Italia', displayNames: { br: 'Copa da Itália', mx: 'Copa Italia' }, type: CompetitionType.DOMESTIC_CUP, region: 'EUROPE', group: 'EUROPE', countryCode: 'IT', countryNames: ['Italy'], lookupNames: ['Coppa Italia'], enabled: true, priority: { br: 290, mx: 250 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'esp-la-liga', slug: 'la-liga', canonicalName: 'La Liga', displayNames: { br: 'La Liga', mx: 'La Liga' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'ES', countryNames: ['Spain'], lookupNames: ['La Liga', 'LaLiga', 'Primera Division'], enabled: true, priority: { br: 100, mx: 60 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'esp-la-liga-2', slug: 'la-liga-2', canonicalName: 'La Liga 2', displayNames: { br: 'La Liga 2', mx: 'La Liga 2' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'ES', countryNames: ['Spain'], lookupNames: ['La Liga 2', 'LaLiga 2', 'Segunda Division'], enabled: true, priority: { br: 300, mx: 260 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'esp-copa-del-rey', slug: 'copa-del-rey', canonicalName: 'Copa del Rey', displayNames: { br: 'Copa do Rei', mx: 'Copa del Rey' }, type: CompetitionType.DOMESTIC_CUP, region: 'EUROPE', group: 'EUROPE', countryCode: 'ES', countryNames: ['Spain'], lookupNames: ['Copa Del Rey', 'Copa del Rey'], enabled: true, priority: { br: 310, mx: 270 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'nld-eredivisie', slug: 'eredivisie', canonicalName: 'Eredivisie', displayNames: { br: 'Eredivisie', mx: 'Eredivisie' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'NL', countryNames: ['Netherlands'], lookupNames: ['Eredivisie'], enabled: true, priority: { br: 160, mx: 170 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'prt-primeira-liga', slug: 'liga-portugal', canonicalName: 'Liga Portugal', displayNames: { br: 'Liga Portugal', mx: 'Liga Portugal' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'PT', countryNames: ['Portugal'], lookupNames: ['Liga Portugal', 'Primeira Liga', 'Liga Portugal Betclic'], enabled: true, priority: { br: 150, mx: 160 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'tur-super-lig', slug: 'super-lig', canonicalName: 'Super Lig', displayNames: { br: 'Super Lig', mx: 'Super Lig' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'EUROPE', group: 'EUROPE', countryCode: 'TR', countryNames: ['Turkey', 'Türkiye'], lookupNames: ['Super Lig', 'Süper Lig'], enabled: true, priority: { br: 320, mx: 280 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'arg-primera-division', slug: 'argentina-primera-division', canonicalName: 'Liga Profesional de Fútbol', displayNames: { br: 'Liga Profissional Argentina', mx: 'Liga Profesional de Fútbol' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'SOUTH_AMERICA', group: 'AMERICAS', countryCode: 'AR', countryNames: ['Argentina'], lookupNames: ['Liga Profesional de Futbol', 'Liga Profesional Argentina', 'Superliga'], enabled: true, priority: { br: 170, mx: 70 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-serie-a', slug: 'brasileirao-serie-a', canonicalName: 'Brasileirão Série A', displayNames: { br: 'Brasileirão Série A', mx: 'Brasileirão Serie A' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Serie A', 'Brasileiro Serie A', 'Brasileirão Série A'], enabled: true, priority: { br: 10, mx: 120 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-serie-b', slug: 'brasileirao-serie-b', canonicalName: 'Brasileirão Série B', displayNames: { br: 'Brasileirão Série B', mx: 'Brasileirão Serie B' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Serie B', 'Brasileiro Serie B', 'Brasileirão Série B'], enabled: true, priority: { br: 40, mx: 290 }, geoRelevance: ['BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-copa-do-brasil', slug: 'copa-do-brasil', canonicalName: 'Copa do Brasil', displayNames: { br: 'Copa do Brasil', mx: 'Copa de Brasil' }, type: CompetitionType.DOMESTIC_CUP, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Copa do Brasil'], enabled: true, priority: { br: 20, mx: 300 }, geoRelevance: ['BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-paulista-a1', slug: 'paulista-a1', canonicalName: 'Paulista A1', displayNames: { br: 'Paulista A1', mx: 'Paulista A1' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Paulista A1', 'Campeonato Paulista'], enabled: true, priority: { br: 50, mx: 310 }, geoRelevance: ['BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-carioca-serie-a', slug: 'carioca-serie-a', canonicalName: 'Carioca Serie A', displayNames: { br: 'Carioca Série A', mx: 'Carioca Serie A' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Carioca Serie A', 'Campeonato Carioca'], enabled: true, priority: { br: 60, mx: 320 }, geoRelevance: ['BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'br-copa-nordeste', slug: 'copa-do-nordeste', canonicalName: 'Copa do Nordeste', displayNames: { br: 'Copa do Nordeste', mx: 'Copa do Nordeste' }, type: CompetitionType.DOMESTIC_CUP, region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Copa do Nordeste'], enabled: true, priority: { br: 65, mx: 330 }, geoRelevance: ['BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'conmebol-libertadores', slug: 'copa-libertadores', canonicalName: 'Copa Libertadores', displayNames: { br: 'Copa Libertadores', mx: 'Copa Libertadores' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'SOUTH_AMERICA', group: 'AMERICAS', countryCode: null, countryNames: ['South America'], lookupNames: ['Copa Libertadores', 'CONMEBOL Libertadores'], enabled: true, priority: { br: 30, mx: 130 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'conmebol-sudamericana', slug: 'copa-sudamericana', canonicalName: 'Copa Sudamericana', displayNames: { br: 'Copa Sul-Americana', mx: 'Copa Sudamericana' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'SOUTH_AMERICA', group: 'AMERICAS', countryCode: null, countryNames: ['South America'], lookupNames: ['Copa Sudamericana', 'CONMEBOL Sudamericana'], enabled: true, priority: { br: 70, mx: 180 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'mx-liga-mx', slug: 'liga-mx', canonicalName: 'Liga MX', displayNames: { br: 'Liga MX', mx: 'Liga MX' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'NORTH_AMERICA', group: 'AMERICAS', countryCode: 'MX', countryNames: ['Mexico'], lookupNames: ['Liga MX', 'Primera Division'], enabled: true, priority: { br: 180, mx: 10 }, geoRelevance: ['MX', 'BR'], seasonStrategy: 'SPLIT', teamType: TeamType.CLUB }),
  target({ key: 'usa-mls', slug: 'mls', canonicalName: 'Major League Soccer', displayNames: { br: 'Major League Soccer', mx: 'Major League Soccer' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'NORTH_AMERICA', group: 'AMERICAS', countryCode: 'US', countryNames: ['USA', 'United States'], lookupNames: ['Major League Soccer', 'MLS'], enabled: true, priority: { br: 190, mx: 30 }, geoRelevance: ['MX', 'BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'concacaf-champions-cup', slug: 'concacaf-champions-cup', canonicalName: 'CONCACAF Champions Cup', displayNames: { br: 'Copa dos Campeões da CONCACAF', mx: 'Copa de Campeones de la CONCACAF' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'NORTH_AMERICA', group: 'AMERICAS', countryCode: null, countryNames: ['North & Central America'], lookupNames: ['CONCACAF Champions Cup', 'CONCACAF Champions League'], enabled: true, priority: { br: 210, mx: 20 }, geoRelevance: ['MX', 'BR'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'sau-pro-league', slug: 'saudi-pro-league', canonicalName: 'Saudi Pro League', displayNames: { br: 'Liga Saudita', mx: 'Liga Profesional Saudí' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'MIDDLE_EAST', group: 'OTHER', countryCode: 'SA', countryNames: ['Saudi Arabia'], lookupNames: ['Pro League', 'Saudi Pro League'], enabled: true, priority: { br: 200, mx: 80 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'sau-pro-league-playoffs', slug: 'saudi-pro-league-playoffs', canonicalName: 'Pro League Play-offs', displayNames: { br: 'Play-offs da Liga Saudita', mx: 'Play-offs de la Liga Saudí' }, type: CompetitionType.DOMESTIC_LEAGUE, region: 'MIDDLE_EAST', group: 'OTHER', countryCode: 'SA', countryNames: ['Saudi Arabia'], lookupNames: ['Pro League Play-offs', 'Pro League Playoffs'], enabled: true, automatic: true, priority: { br: 330, mx: 340 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'uefa-champions-league', slug: 'champions-league', canonicalName: 'UEFA Champions League', displayNames: { br: 'Liga dos Campeões da UEFA', mx: 'Liga de Campeones de la UEFA' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'EUROPE', group: 'EUROPE', countryCode: null, countryNames: ['Europe'], lookupNames: ['UEFA Champions League', 'Champions League'], enabled: true, priority: { br: 80, mx: 40 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'uefa-europa-league', slug: 'europa-league', canonicalName: 'UEFA Europa League', displayNames: { br: 'Liga Europa da UEFA', mx: 'Liga Europa de la UEFA' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'EUROPE', group: 'EUROPE', countryCode: null, countryNames: ['Europe'], lookupNames: ['UEFA Europa League', 'Europa League'], enabled: true, priority: { br: 140, mx: 90 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'uefa-conference-league', slug: 'conference-league', canonicalName: 'UEFA Conference League', displayNames: { br: 'Liga Conferência da UEFA', mx: 'Liga Conferencia de la UEFA' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'EUROPE', group: 'EUROPE', countryCode: null, countryNames: ['Europe'], lookupNames: ['UEFA Conference League', 'Conference League', 'Europa Conference League'], enabled: true, priority: { br: 145, mx: 100 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB }),
  target({ key: 'uefa-super-cup', slug: 'uefa-super-cup', canonicalName: 'UEFA Super Cup', displayNames: { br: 'Supercopa da UEFA', mx: 'Supercopa de la UEFA' }, type: CompetitionType.CONTINENTAL_CLUB, region: 'EUROPE', group: 'EUROPE', countryCode: null, countryNames: ['Europe'], lookupNames: ['UEFA Super Cup', 'Super Cup'], enabled: true, priority: { br: 230, mx: 110 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'EDITION', teamType: TeamType.CLUB }),
] as const;

// Canonical aliases only. Provider IDs must be discovered and persisted from the real subscription.
const localTarget=(key:string,slug:string,name:string,countryCode:string,countryNames:string[],lookupNames:string[],type:CompetitionType,seasonStrategy:SeasonStrategy='SPLIT')=>target({key,slug,canonicalName:name,displayNames:{br:name,mx:name},countryCode,countryNames,lookupNames,type,seasonStrategy,region:countryCode==='MX'?'NORTH_AMERICA':'SOUTH_AMERICA',group:'AMERICAS',enabled:true,priority:{br:100,mx:100},geoRelevance:CORE_GEOS,teamType:TeamType.CLUB});
export const NEW_GEO_COMPETITION_TARGETS:readonly FootballCompetitionTarget[]=[
  localTarget('mx-liga-expansion','liga-expansion-mx','Liga de Expansión MX','MX',['Mexico'],['Liga de Expansión MX','Liga de Expansion MX','Liga de Expansión','Liga de Expansion','Liga de Ascenso','Ascenso MX'],CompetitionType.DOMESTIC_LEAGUE),
  {...localTarget('concacaf-leagues-cup','leagues-cup','Leagues Cup','MX',['North & Central America','USA','United States','Mexico'],['Leagues Cup'],CompetitionType.CONTINENTAL_CLUB,'EDITION'),countryCode:null},
  localTarget('co-primera-a','colombia-primera-a','Liga BetPlay / Primera A','CO',['Colombia'],['Primera A','Liga BetPlay','Liga Betplay Dimayor','Liga BetPlay Dimayor'],CompetitionType.DOMESTIC_LEAGUE),
  localTarget('co-copa-colombia','copa-colombia','Copa Colombia','CO',['Colombia'],['Copa Colombia','Copa BetPlay','Copa Betplay Dimayor'],CompetitionType.DOMESTIC_CUP,'STANDARD'),
  localTarget('co-primera-b','colombia-primera-b','Primera B / Torneo BetPlay','CO',['Colombia'],['Primera B','Torneo BetPlay','Torneo Betplay Dimayor'],CompetitionType.DOMESTIC_LEAGUE),
  localTarget('pe-liga-1','peru-liga-1','Liga 1 de Perú','PE',['Peru','Perú'],['Primera Division','Primera División','Liga 1'],CompetitionType.DOMESTIC_LEAGUE),
  localTarget('pe-liga-2','peru-liga-2','Liga 2 de Perú','PE',['Peru','Perú'],['Segunda Division','Segunda División','Liga 2'],CompetitionType.DOMESTIC_LEAGUE),
];
export const CANONICAL_COMPETITION_TARGETS:readonly FootballCompetitionTarget[]=[...FOOTBALL_COMPETITION_TARGETS,...NEW_GEO_COMPETITION_TARGETS];
export const APPROVED_COMPETITION_TARGETS=CANONICAL_COMPETITION_TARGETS.filter(item=>item.approvedInventory);
export const APPROVED_COMPETITION_SLUGS=APPROVED_COMPETITION_TARGETS.map(item=>item.slug);
export function isAcquisitionCompetition(slug:string):boolean{return APPROVED_COMPETITION_TARGETS.some(item=>item.slug===slug&&!item.parentSlug);}

export const DEFAULT_INGESTION_WINDOW = { daysPast: 7, daysFuture: 21 } as const;

export function targetBySlug(slug: string): FootballCompetitionTarget | undefined {
  return CANONICAL_COMPETITION_TARGETS.find(item => item.slug === slug);
}

export function targetsForGeo(geo: ProductGeo): FootballCompetitionTarget[] {
  return APPROVED_COMPETITION_TARGETS.filter(item=>!item.parentSlug).sort((left,right)=>competitionDemand(geo,right.slug)-competitionDemand(geo,left.slug)||left.slug.localeCompare(right.slug));
}
