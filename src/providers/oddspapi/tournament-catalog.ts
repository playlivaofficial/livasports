import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {M5_EXPANDED_TOURNAMENTS,M5_REJECTED_TOURNAMENTS,M5_TOURNAMENTS} from './m5-normalizer';

export interface CatalogTournament {
  id: string;
  slug: string;
  category: string;
  canonical: string;
}

type ObjectValue = Record<string, unknown>;
const obj = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};

/**
 * Provider slug + category → canonical competition. IDs are never invented here;
 * they are copied from OddsPapi catalog rows that uniquely match a rule.
 */
export const TOURNAMENT_IDENTITY_RULES: readonly {slug: string; category: string; canonical: string}[] = [
  {slug: 'brasileiro-serie-a', category: 'brazil', canonical: 'brasileirao-serie-a'},
  {slug: 'brasileiro-serie-b', category: 'brazil', canonical: 'brasileirao-serie-b'},
  {slug: 'copa-do-brasil', category: 'brazil', canonical: 'copa-do-brasil'},
  {slug: 'campeonato-paulista', category: 'brazil', canonical: 'paulista-a1'},
  {slug: 'paulista-a1', category: 'brazil', canonical: 'paulista-a1'},
  {slug: 'campeonato-carioca', category: 'brazil', canonical: 'carioca-serie-a'},
  {slug: 'carioca-serie-a', category: 'brazil', canonical: 'carioca-serie-a'},
  {slug: 'copa-do-nordeste', category: 'brazil', canonical: 'copa-do-nordeste'},
  {slug: 'copa-libertadores', category: 'international-clubs', canonical: 'copa-libertadores'},
  {slug: 'copa-sudamericana', category: 'international-clubs', canonical: 'copa-sudamericana'},
  {slug: 'premier-league', category: 'england', canonical: 'premier-league'},
  {slug: 'championship', category: 'england', canonical: 'championship'},
  {slug: 'fa-cup', category: 'england', canonical: 'fa-cup'},
  {slug: 'efl-cup', category: 'england', canonical: 'carabao-cup'},
  {slug: 'league-cup', category: 'england', canonical: 'carabao-cup'},
  {slug: 'carabao-cup', category: 'england', canonical: 'carabao-cup'},
  {slug: 'bundesliga', category: 'germany', canonical: 'bundesliga'},
  {slug: 'ligue-1', category: 'france', canonical: 'ligue-1'},
  {slug: 'ligue-2', category: 'france', canonical: 'ligue-2'},
  {slug: 'serie-a', category: 'italy', canonical: 'serie-a-italy'},
  {slug: 'serie-b', category: 'italy', canonical: 'serie-b-italy'},
  {slug: 'coppa-italia', category: 'italy', canonical: 'coppa-italia'},
  {slug: 'la-liga', category: 'spain', canonical: 'la-liga'},
  {slug: 'laliga', category: 'spain', canonical: 'la-liga'},
  {slug: 'la-liga-2', category: 'spain', canonical: 'la-liga-2'},
  {slug: 'segunda-division', category: 'spain', canonical: 'la-liga-2'},
  {slug: 'copa-del-rey', category: 'spain', canonical: 'copa-del-rey'},
  {slug: 'eredivisie', category: 'netherlands', canonical: 'eredivisie'},
  {slug: 'liga-portugal', category: 'portugal', canonical: 'liga-portugal'},
  {slug: 'primeira-liga', category: 'portugal', canonical: 'liga-portugal'},
  {slug: 'super-lig', category: 'turkey', canonical: 'super-lig'},
  {slug: 'super-lig', category: 'turkiye', canonical: 'super-lig'},
  {slug: 'liga-profesional', category: 'argentina', canonical: 'argentina-primera-division'},
  {slug: 'liga-profesional-de-futbol', category: 'argentina', canonical: 'argentina-primera-division'},
  {slug: 'liga-mx-apertura', category: 'mexico', canonical: 'liga-mx'},
  {slug: 'liga-mx-clausura', category: 'mexico', canonical: 'liga-mx'},
  {slug: 'liga-mx', category: 'mexico', canonical: 'liga-mx'},
  {slug: 'mls', category: 'usa', canonical: 'mls'},
  {slug: 'major-league-soccer', category: 'usa', canonical: 'mls'},
  {slug: 'concacaf-champions-cup', category: 'international-clubs', canonical: 'concacaf-champions-cup'},
  {slug: 'saudi-pro-league', category: 'saudi-arabia', canonical: 'saudi-pro-league'},
  {slug: 'uefa-champions-league', category: 'international-clubs', canonical: 'champions-league'},
  {slug: 'champions-league', category: 'international-clubs', canonical: 'champions-league'},
  {slug: 'uefa-europa-league', category: 'international-clubs', canonical: 'europa-league'},
  {slug: 'europa-league', category: 'international-clubs', canonical: 'europa-league'},
  {slug: 'uefa-europa-conference-league', category: 'international-clubs', canonical: 'conference-league'},
  {slug: 'conference-league', category: 'international-clubs', canonical: 'conference-league'},
  {slug: 'uefa-super-cup', category: 'international-clubs', canonical: 'uefa-super-cup'},
];

export const normalizeName = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Provider category for a registry competition: national competitions use the country name, continental ones the clubs category. */
export function registryCategoryMatches(target: {countryCode: string | null; countryNames: readonly string[]}, row: ObjectValue): boolean {
  if (target.countryCode === null) return String(row.categorySlug) === 'international-clubs';
  const names = new Set(target.countryNames.map(normalizeName));
  return names.has(normalizeName(row.categoryName)) || names.has(normalizeName(String(row.categorySlug).replace(/-/g, ' ')));
}
export function resolveCatalogTournaments(raw: unknown[]): CatalogTournament[] {
  const rows = (Array.isArray(raw) ? raw : []).map(obj);
  const resolved: CatalogTournament[] = [];
  for (const rule of TOURNAMENT_IDENTITY_RULES) {
    const found = rows.filter(row => String(row.tournamentSlug) === rule.slug && String(row.categorySlug) === rule.category);
    if (found.length !== 1) continue;
    const id = String(found[0].tournamentId ?? '');
    if (!/^[0-9]{1,10}$/.test(id)) continue;
    resolved.push({id, slug: rule.slug, category: rule.category, canonical: rule.canonical});
  }
  const byCanonical = new Map<string, CatalogTournament>();
  for (const row of resolved) if (!byCanonical.has(row.canonical)) byCanonical.set(row.canonical, row);
  // P0 incident fallback: an enabled registry competition without a slug rule resolves only when exactly one
  // provider row in the matching country/clubs category carries one of the registry's reviewed lookup names.
  // The ID is still copied from the provider row; nothing is guessed.
  for (const target of FOOTBALL_COMPETITION_TARGETS) {
    if (!target.enabled || byCanonical.has(target.slug)) continue;
    const names = new Set([target.canonicalName, ...target.lookupNames].map(normalizeName));
    const found = rows.filter(row => registryCategoryMatches(target, row) && names.has(normalizeName(row.tournamentName)) && /^[0-9]{1,10}$/.test(String(row.tournamentId ?? '')));
    if (found.length !== 1) continue;
    byCanonical.set(target.slug, {id: String(found[0].tournamentId), slug: String(found[0].tournamentSlug), category: String(found[0].categorySlug), canonical: target.slug});
  }
  return [...byCanonical.values()];
}
/** Provider rows that no rule or lookup name resolves, limited to categories the registry cares about — the actionable list for a mapping gap. */
export function unmatchedCatalogRows(raw: unknown[]): Array<{id: string; slug: string; category: string; name: string; futureFixtures: number | null}> {
  const resolvedIds = new Set(resolveCatalogTournaments(raw).map(row => row.id));
  const relevant = (row: ObjectValue) => FOOTBALL_COMPETITION_TARGETS.some(target => target.enabled && registryCategoryMatches(target, row));
  return (Array.isArray(raw) ? raw : []).map(obj).filter(row => !resolvedIds.has(String(row.tournamentId)) && relevant(row))
    .map(row => ({id: String(row.tournamentId ?? ''), slug: String(row.tournamentSlug ?? ''), category: String(row.categorySlug ?? ''), name: String(row.tournamentName ?? ''), futureFixtures: typeof row.futureFixtures === 'number' ? row.futureFixtures : null}));
}

export const STABLE_TOURNAMENT_IDS: ReadonlySet<string> = new Set(M5_TOURNAMENTS.map(row => row.id));
export function isStableOddsTournament(id: string): boolean {
  return STABLE_TOURNAMENT_IDS.has(id);
}
export function selectCanaryTournament(
  slug: string,
  raw: unknown[],
  expanded: readonly {id:string;slug:string;category:string;canonical:string}[]=M5_EXPANDED_TOURNAMENTS,
): CatalogTournament {
  const candidate=resolveCatalogTournaments(raw).find(row=>row.canonical===slug);
  if(!candidate)throw new Error('ODDS_TOURNAMENT_UNVERIFIED');
  if(M5_TOURNAMENTS.some(row=>row.id===candidate.id))throw new Error('ODDS_TOURNAMENT_ALREADY_STABLE');
  if(M5_REJECTED_TOURNAMENTS.some(row=>row.id===candidate.id))throw new Error('ODDS_TOURNAMENT_CANARY_REJECTED');
  if(schedulerTournaments(raw,expanded).some(row=>row.id===candidate.id))throw new Error('ODDS_TOURNAMENT_ALREADY_SCHEDULED');
  return candidate;
}

/**
 * Registry-driven scheduler targets (P0 odds coverage incident). Every catalog row that resolves through
 * TOURNAMENT_IDENTITY_RULES to an enabled registry competition is scheduled; IDs are always copied from the
 * provider catalog, never invented. The historical M5 expanded allowlist no longer gates coverage, so a
 * returning or newly listed competition (e.g. the Conference League) is refreshed automatically before
 * users need it. Previously rejected IDs stay eligible: the scheduler probes them in isolation and backs
 * off for 12 hours on an empty feed, so they self-recover once the provider lists fixtures.
 */
export function schedulerTournaments(raw: unknown[], expanded: readonly {id:string;slug:string;category:string;canonical:string}[]=M5_EXPANDED_TOURNAMENTS): CatalogTournament[] {
  const resolved = resolveCatalogTournaments(raw);
  const byId = new Map(resolved.map(row => [row.id, row]));
  const stable = M5_TOURNAMENTS.map(row => byId.get(row.id) ?? {id: row.id, slug: row.slug, category: row.category, canonical: row.canonical});
  const enabled = new Set(FOOTBALL_COMPETITION_TARGETS.filter(target => target.enabled).map(target => target.slug));
  const stableIds = new Set(stable.map(row => row.id));
  // Verified expanded rows keep their exact identity check; any other resolved row must map to an enabled competition.
  const verified = expanded.flatMap(row => {
    const found = byId.get(row.id);
    if (!found || found.slug !== row.slug || found.category !== row.category || found.canonical !== row.canonical) return [];
    return [found];
  });
  const verifiedIds = new Set(verified.map(row => row.id));
  const discovered = resolved.filter(row => !stableIds.has(row.id) && !verifiedIds.has(row.id) && enabled.has(row.canonical));
  return [...stable, ...verified, ...discovered];
}
/** Keep every well-formed provider row (rules apply at resolve time) so mapping gaps stay visible instead of being discarded. */
export function mergeCatalogTournaments(existing: unknown[], incoming: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  for (const value of [...existing, ...incoming]) {
    const row = obj(value);
    const id = String(row.tournamentId ?? '');
    if (!/^[0-9]{1,10}$/.test(id) || typeof row.tournamentSlug !== 'string' || typeof row.categorySlug !== 'string') continue;
    byId.set(id, value);
  }
  return [...byId.values()];
}

export function catalogNeedsExpansion(raw: unknown[], upcomingCanonicals: readonly string[]): boolean {
  const mapped = new Set(resolveCatalogTournaments(raw).map(row => row.canonical));
  return FOOTBALL_COMPETITION_TARGETS.some(target => target.enabled && upcomingCanonicals.includes(target.slug) && !mapped.has(target.slug));
}
