import { KICKOFF_TOLERANCE_MS, type CanonicalOddsFixture, type FixtureMatch, type PersistedFixtureMapping, type ProviderOddsFixture } from './types';
import type {TeamIdentity} from './identity';

// Reviewed aliases only. Accents/punctuation are normalized, but club suffixes are never stripped.
const aliases: Record<string, Record<string,string>> = {
  'brasileirao-serie-a': { paranaense:'athletico pr' },
  'brasileirao-serie-b': {
    'juventude rs':'juventude', 'ec juventude rs':'juventude',
    'athletic club sjdr':'athletic club', 'athletic club sjdr mg':'athletic club',
    'gremio novorizontino':'novorizontino', 'gremio novorizontino sp':'novorizontino',
    'america fc':'america mineiro', 'america fc mg':'america mineiro',
    botafogo:'botafogo sp', 'botafogo fc sp':'botafogo sp',
    'operario ferroviario ec pr':'operario pr',
    'cr brasil':'crb', 'cr brasil al':'crb',
    'sc recife pe':'sport recife',
    'ac goianiense go':'atletico go',
  },
  'liga-mx': { tigres:'tigres uanl', 'san luis':'atletico san luis', 'tijuana de caliente':'tijuana', 'club tijuana de caliente':'tijuana' },
  // P0 2026-10-08: saved OddsPapi events checked against canonical competition,
  // both participant roles and exact UTC kickoff. No fuzzy/global suffix matching.
  'liga-expansion-mx': {
    'alebrijes de oaxaca fc':'alebrijes de oaxaca','cf correcaminos uat':'correcaminos uat',
    'club atletico la paz':'ca la paz','tepatitlan fc':'tepatitlan de morelos','atletico morelia':'morelia',
    'piratas veracruz':'piratas','leones negros udeg':'universidad guadalajara',
    'alacranes de durango':'durango','cd mineros de zacatecas':'mineros de zacatecas','cancun fc':'cancun',
  },
  'colombia-primera-a': {
    'cd tolima':'deportes tolima','fortaleza fc':'fortaleza ceif','deportivo pereira fc sa':'deportivo pereira',
    'cd junior fc':'junior fc','aguilas doradas rionegro':'rionegro aguilas',
    // DIMAYOR confirms the Valledupar move (2024-01-24) and current club name
    // (2026-01-16). Saved event id1002707072335194 has the same opponent/roles
    // and exact 2026-10-09T23:00Z kickoff as the legacy canonical club identity.
    'alianza fc valledupar':'alianza petrolera',
    // P0 2026-10-09 saved event id1002707072335196: both roles and UTC kickoff
    // agree uniquely with Boyacá Chicó–Cúcuta Deportivo. Scoped, never global suffix removal.
    'cucuta deportivo fc':'cucuta deportivo','cucuta':'cucuta deportivo',
  },
  'colombia-primera-b': {
    'atletico fc cali':'atletico','real cartagena fc':'real cartagena','boyaca patriotas':'patriotas boyaca',
    // Same-role Envigado–Internacional Palmira event id1000123874458760 at 2026-10-11T20:00Z.
    'internacional fc de palmira':'internacional palmira',
  },
  'saudi-pro-league': {
    // Saved event id1000095573215752, Al Fateh–Al Ahli, exact 2026-10-09T14:55Z.
    // The country qualifier distinguishes this club from similarly named clubs elsewhere.
    'al ahli saudi fc':'al ahli','al ahli saudi':'al ahli',
  },
  'ligue-2': {'grenoble foot':'grenoble foot 38','nancy lorraine':'nancy','stade lavallois mfc':'laval',
    'sochaux montbeliard':'sochaux','clermont foot 63':'clermont'},
  'peru-liga-1': {
    // Reviewed against the 2026-10-08 saved feed and unique canonical events: same teams, roles and UTC kickoff.
    // Liga1's 2026 club register confirms the full names; Moquegua is the former UCV Moquegua club.
    'cd moquegua':'ucv moquegua',
    'los chankas cyc':'los chankas',
    'asociacion deportiva tarma':'adt',
    'juan pablo ii college':'adc juan pablo ii',
    'utc de cajamarca':'utc cajamarca',
  },
  'premier-league': { nottingham:'nottingham forest', hull:'hull city', ipswich:'ipswich town', brighton:'brighton and hove albion', newcastle:'newcastle united' },
  'copa-libertadores': { 'estudiantes la plata':'estudiantes', 'ind del valle':'independiente del valle' },
  'la-liga': {
    'atletico madrid':'atletico de madrid',
    'rc deportivo de a coruna':'deportivo a coruna',
    'athletic bilbao':'athletic club',
    'rc celta de vigo':'celta de vigo',
    'celta vigo':'celta de vigo',
  },
  'la-liga-2': {
    'ad ceuta':'ceuta',
    'real sociedad san sebastian b':'real sociedad ii',
  },
  'bundesliga': {
    'bayern munich':'fc bayern munchen',
    'union berlin':'fc union berlin',
    'fsv mainz':'fsv mainz 05',
    '1 fc cologne':'fc koln',
    'bayer leverkusen':'bayer 04 leverkusen',
  },
  'serie-a-italy': {
    'parma calcio':'parma',
  },
  'europa-league': {
    'rc celta de vigo':'celta de vigo',
    'celta vigo':'celta de vigo',
    'sparta prague':'sparta praha',
    'bayer leverkusen':'bayer 04 leverkusen',
    'nk celje':'celje',
    'olympique lyon':'olympique lyonnais',
    'stade rennais fc':'rennes',
    'stade rennais':'rennes',
    'sl benfica':'benfica',
    'olympiacos piraeus':'olympiacos f c',
    'olympiacos':'olympiacos f c',
    'jagiellonia bialystok':'jagiellonia bia ystok',
    'jagiellonia':'jagiellonia bia ystok',
    'hapoel be er sheva fc':'hapoel be er sheva',
    'ofi crete':'ofi',
    'lillestroem sk':'lillestr m',
    'lillestroem':'lillestr m',
    'fc viktoria plzen':'viktoria plzen',
  },
  'copa-sudamericana': {
    'independiente santa fe':'santa fe',
    'independ santa fe':'santa fe',
  },
  'mls': {
    'vancouver whitecaps fc':'vancouver whitecaps',
    'new york red bulls':'new york rb',
    'orlando city sc':'orlando city',
    'san jose earthquakes':'sj earthquakes',
    'sporting kansas city':'sporting kc',
    'minnesota united fc':'minnesota united',
    'los angeles galaxy':'la galaxy',
    'saint louis city sc':'st louis city',
    'atlanta united fc':'atlanta united',
    'inter miami cf':'inter miami',
    'lafc':'los angeles fc',
  },
  'ligue-1': {
    'strasbourg alsace':'strasbourg',
    'olympique lyon':'olympique lyonnais',
    'stade rennais fc':'rennes',
    'stade rennais':'rennes',
    'stade brest 29':'brest',
    'lille osc':'losc lille',
  },
  'liga-portugal': {
    'maritimo madeira':'maritimo',
    'sc braga':'sporting braga',
    'sl benfica':'benfica',
    'gil vicente barcelos':'gil vicente',
    'santa clara azores':'santa clara',
    'vitoria sc guimaraes':'vitoria guimaraes',
    'academico de viseu fc':'academico viseu',
  },
  'eredivisie': {
    'fc twente enschede':'fc twente',
    'psv eindhoven':'psv',
  },
  'champions-league': {
    'lille osc':'losc lille',
    'atletico madrid':'atletico de madrid',
    'bayern munich':'fc bayern munchen',
    'psv eindhoven':'psv',
    'bodoe glimt':'bod glimt',
    'fc shakhtar donetsk':'shakhtar donetsk',
    'sabah masazir':'sabah',
    'slavia prague':'slavia praha',
  },
  'argentina-primera-division': {
    'ca sarmiento junin':'sarmiento',
    // Reviewed against the saved provider fixture and the unique same-role, same-kickoff canonical event.
    'racing club avellaneda':'racing club',
    'deportivo riestra afbc':'deportivo riestra',
    'ca barracas central':'barracas central',
    'ca central cordoba se':'central cordoba sde',
    'ca independiente avellaneda':'independiente',
    'independiente avellaneda':'independiente',
    'instituto ac cordoba':'instituto',
    'instituto cordoba':'instituto',
    'ca san lorenzo de almagro':'san lorenzo',
    'san lorenzo de almagro':'san lorenzo',
    'ca rosario central':'rosario central',
    'estudiantes de la plata':'estudiantes',
    'estudiantes la plata':'estudiantes',
    'ca belgrano de cordoba':'belgrano',
    'belgrano de cordoba':'belgrano',
    'estudiantes rio cuarto':'estudiantes de rio cuarto',
  },
  'serie-b-italy': {
    'l r vicenza':'vicenza',
    'ss arezzo':'arezzo',
    'fc sudtirol bolzano':'sudtirol',
    'sudtirol bolzano':'sudtirol',
  },
  'coppa-italia': {
    'fc sudtirol bolzano':'sudtirol',
    'sudtirol bolzano':'sudtirol',
  },
  'super-lig': {
    'kasimpasa istanbul':'kasimpasa',
    'gaziantep fk':'gaziantep f k',
    'goztepe izmir':'goztepe',
    'amed sportif faaliyetler':'amed sk',
  },
  'conference-league': {
    // Explicit contextual variants; never strip club suffixes globally or relax the kickoff guard.
    'hnk hajduk split':'hajduk split',
    'agf aarhus':'agf',
    'fk borac banja luka':'borac banja luka',
    'riga fc':'riga',
    'cs universitatea craiova':'universitatea craiova',
    'fk kauno zalgiris':'kauno zalgiris',
  },
};
export function normalizeTeamName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\u0131/g,'i').replace(/\u0307/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
export function namesMatch(names: string[], canonical: string, competition: string): boolean {
  const target=normalizeTeamName(canonical);
  return names.some(n=> { const normalized=normalizeTeamName(n); return normalized===target || aliases[competition]?.[normalized]===target; });
}
export const UTC_PARSE_DEFECT_MS = 4 * 60 * 60 * 1000;
export function planUtcParseDefectRepair(raw: ProviderOddsFixture, fixtures: readonly CanonicalOddsFixture[]): {fixtureId:string;before:string;after:string} | null {
  if(raw.sport!=='FOOTBALL'||!raw.competition) return null;
  const named=fixtures.filter(f=>f.sport===raw.sport&&f.competition===raw.competition
    &&namesMatch(raw.homeNames,f.home,f.competition)&&namesMatch(raw.awayNames,f.away,f.competition));
  if(named.length!==1) return null;
  const before=named[0].kickoff;const after=raw.kickoff;
  if(!Number.isFinite(Date.parse(before))||!Number.isFinite(Date.parse(after))||Date.parse(after)-Date.parse(before)!==UTC_PARSE_DEFECT_MS) return null;
  return {fixtureId:named[0].id,before,after};
}
export function matchOddsFixture(raw: ProviderOddsFixture, fixtures: readonly CanonicalOddsFixture[], mappings: readonly PersistedFixtureMapping[], identities:readonly TeamIdentity[]=[]): FixtureMatch {
  const fail=(state:FixtureMatch['state'],reason:string):FixtureMatch=>({state,reason,fixture:null});
  if(raw.sport!=='FOOTBALL'||!raw.competition) return fail('COMPETITION_MISMATCH','Unverified football tournament identity');
  const saved=mappings.filter(m=>m.providerId===raw.providerId);
  if(saved.length>1) return fail('AMBIGUOUS','Duplicate provider identity');
  const pool=saved.length ? fixtures.filter(f=>f.id===saved[0].fixtureId) : fixtures;
  if(saved.length && (saved[0].homeProviderId!==raw.homeProviderId || saved[0].awayProviderId!==raw.awayProviderId)) return fail('TEAM_MISMATCH','Persisted home/away identity changed');
  const competition=pool.filter(f=>f.sport===raw.sport&&f.competition===raw.competition);
  if(!competition.length) return fail('COMPETITION_MISMATCH','Canonical competition is absent or changed');
  const teamMatches=(providerId:string,names:string[],teamId:string,name:string,f:CanonicalOddsFixture)=>{
    const ids=[...new Set(identities.filter(i=>i.providerId===providerId).map(i=>i.teamId))];
    if(ids.length)return ids.length===1&&ids[0]===teamId;
    const named=[...new Set(identities.filter(i=>i.competitionId===f.competitionId&&i.normalizedName&&names.some(n=>normalizeTeamName(n)===i.normalizedName)).map(i=>i.teamId))];
    if(named.length)return named.length===1&&named[0]===teamId;
    return namesMatch(names,name,f.competition);
  };
  const teams=competition.filter(f=>teamMatches(raw.homeProviderId,raw.homeNames,f.homeId,f.home,f)&&teamMatches(raw.awayProviderId,raw.awayNames,f.awayId,f.away,f));
  if(!teams.length) return fail('TEAM_MISMATCH','No exact contextual home/away aliases');
  const timed=teams.filter(f=>Number.isFinite(Date.parse(raw.kickoff))&&Math.abs(Date.parse(f.kickoff)-Date.parse(raw.kickoff))<=KICKOFF_TOLERANCE_MS);
  if(!timed.length) return fail('TIME_MISMATCH','Kickoff differs by more than ten minutes; no auto-correction');
  if(timed.length!==1) return fail('AMBIGUOUS','Multiple canonical fixtures inside kickoff tolerance');
  // A second provider event must not take over an existing canonical identity.
  if(mappings.some(m=>m.fixtureId===timed[0].id&&m.providerId!==raw.providerId)) return fail('AMBIGUOUS','Canonical fixture already has another provider identity');
  // A rescheduled fixture keeps its identity: the provider event, both team identities and the canonical fixture are
  // unchanged, and the provider's kickoff still agrees with ours. Only the stored timestamps are historical, so this
  // is the explicit reconciliation the stored mapping needs — not a reason to drop every price for the fixture.
  const rescheduled=saved.length>0&&((!!saved[0].canonicalKickoff&&Date.parse(saved[0].canonicalKickoff)!==Date.parse(timed[0].kickoff))||
    (!!saved[0].providerKickoff&&Date.parse(saved[0].providerKickoff)!==Date.parse(raw.kickoff)));
  if(rescheduled)return {state:'EXACT',fixture:timed[0],reason:'Persisted identity revalidated; stored kickoff reconciled to the current provider and canonical kickoff'};
  return {state:saved.length?'EXACT':'HIGH_CONFIDENCE',fixture:timed[0],reason:saved.length?'Persisted identity and all signals revalidated':'Unique sport, competition, explicit names, roles and UTC kickoff'};
}

/** Ingestion, saved-response recovery and audits must apply exactly the same ambiguity checks. */
export function matchOddsSnapshot(raws:readonly ProviderOddsFixture[],fixtures:readonly CanonicalOddsFixture[],mappings:readonly PersistedFixtureMapping[],identities:readonly TeamIdentity[]=[]){
  const matches=raws.map(raw=>({raw,...matchOddsFixture(raw,fixtures,mappings,identities),candidateFixtureIds:fixtures.filter(f=>f.competition===raw.competition&&Math.abs(Date.parse(f.kickoff)-Date.parse(raw.kickoff))<=KICKOFF_TOLERANCE_MS).map(f=>f.id)}));
  const counts=new Map<string,number>();for(const m of matches)if(m.fixture)counts.set(m.fixture.id,(counts.get(m.fixture.id)??0)+1);
  for(const m of matches)if(m.fixture&&(counts.get(m.fixture.id)??0)>1){m.fixture=null;m.state='AMBIGUOUS';m.reason='Multiple events claim the same canonical fixture in this response';}
  return matches;
}
