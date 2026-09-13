import { KICKOFF_TOLERANCE_MS, type CanonicalOddsFixture, type FixtureMatch, type PersistedFixtureMapping, type ProviderOddsFixture } from './types';

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
  },
  'liga-mx': { tigres:'tigres uanl', 'san luis':'atletico san luis' },
  'premier-league': { nottingham:'nottingham forest', hull:'hull city', ipswich:'ipswich town', brighton:'brighton and hove albion', newcastle:'newcastle united' },
  'copa-libertadores': { 'estudiantes la plata':'estudiantes', 'ind del valle':'independiente del valle' },
  'la-liga': {
    'atletico madrid':'atletico de madrid',
    'rc deportivo de a coruna':'deportivo a coruna',
    'athletic bilbao':'athletic club',
    'rc celta de vigo':'celta de vigo',
    'celta vigo':'celta de vigo',
  },
};
export function normalizeTeamName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
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
export function matchOddsFixture(raw: ProviderOddsFixture, fixtures: readonly CanonicalOddsFixture[], mappings: readonly PersistedFixtureMapping[]): FixtureMatch {
  const fail=(state:FixtureMatch['state'],reason:string):FixtureMatch=>({state,reason,fixture:null});
  if(raw.sport!=='FOOTBALL'||!raw.competition) return fail('COMPETITION_MISMATCH','Unverified football tournament identity');
  const saved=mappings.filter(m=>m.providerId===raw.providerId);
  if(saved.length>1) return fail('AMBIGUOUS','Duplicate provider identity');
  const pool=saved.length ? fixtures.filter(f=>f.id===saved[0].fixtureId) : fixtures;
  if(saved.length && (saved[0].homeProviderId!==raw.homeProviderId || saved[0].awayProviderId!==raw.awayProviderId)) return fail('TEAM_MISMATCH','Persisted home/away identity changed');
  const competition=pool.filter(f=>f.sport===raw.sport&&f.competition===raw.competition);
  if(!competition.length) return fail('COMPETITION_MISMATCH','Canonical competition is absent or changed');
  const teams=competition.filter(f=>namesMatch(raw.homeNames,f.home,f.competition)&&namesMatch(raw.awayNames,f.away,f.competition));
  if(!teams.length) return fail('TEAM_MISMATCH','No exact contextual home/away aliases');
  const timed=teams.filter(f=>Number.isFinite(Date.parse(raw.kickoff))&&Math.abs(Date.parse(f.kickoff)-Date.parse(raw.kickoff))<=KICKOFF_TOLERANCE_MS);
  if(!timed.length) return fail('TIME_MISMATCH','Kickoff differs by more than ten minutes; no auto-correction');
  if(timed.length!==1) return fail('AMBIGUOUS','Multiple canonical fixtures inside kickoff tolerance');
  if(saved.length&&((saved[0].canonicalKickoff&&Date.parse(saved[0].canonicalKickoff)!==Date.parse(timed[0].kickoff))||
    (saved[0].providerKickoff&&Date.parse(saved[0].providerKickoff)!==Date.parse(raw.kickoff))))return fail('TIME_MISMATCH','Persisted kickoff changed; requires explicit source reconciliation, not discovery tolerance');
  // A second provider event must not take over an existing canonical identity.
  if(mappings.some(m=>m.fixtureId===timed[0].id&&m.providerId!==raw.providerId)) return fail('AMBIGUOUS','Canonical fixture already has another provider identity');
  return {state:saved.length?'EXACT':'HIGH_CONFIDENCE',fixture:timed[0],reason:saved.length?'Persisted identity and all signals revalidated':'Unique sport, competition, explicit names, roles and UTC kickoff'};
}
