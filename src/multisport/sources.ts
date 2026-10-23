import type { SportId } from './model';
import catalog from './catalog-data.json';
import { WIKIMEDIA_DATASETS } from './wikimedia-datasets';

export interface SportsSource {
  id: string;
  name: string;
  homepage: string;
  status: 'approved' | 'pending';
  licenseId: string | null;
  licenseUrl: string | null;
  sports: readonly SportId[];
  factualDataOnly: true;
  logoRights: 'not-granted';
  attribution: string;
  updateIntervalHours: number | null;
  automaticPolicy: string;
  snapshotPolicy: 'bundesliga-full' | 'historical-results-only' | 'reviewed-community-tables' | 'unapproved';
}

const pending = (id: string, name: string, homepage: string, sports: SportId[]): SportsSource => ({
  id, name, homepage, sports: Object.freeze(sports), status: 'pending', licenseId: null, licenseUrl: null,
  factualDataOnly: true, logoRights: 'not-granted', attribution: name, updateIntervalHours: null,
  automaticPolicy: 'No import or publication until a specific factual-data licence is approved.',
  snapshotPolicy: 'unapproved',
});

/** Approval applies to factual datasets only. A public endpoint is not a licence for its imagery. */
export const SPORTS_SOURCES: Readonly<Record<string, Readonly<SportsSource>>> = Object.freeze(
  Object.fromEntries([
    {
      id: 'openligadb', name: 'OpenLigaDB', homepage: 'https://www.openligadb.de', status: 'approved',
      licenseId: 'ODbL-1.0', licenseUrl: 'https://beta.openligadb.de/lizenz',
      sports: Object.freeze(['football']), factualDataOnly: true, logoRights: 'not-granted',
      attribution: 'Data: OpenLigaDB, Open Database Licence (ODbL) 1.0. Preserve attribution and applicable share-alike obligations.',
      updateIntervalHours: 6,
      automaticPolicy: 'A few checks per day: check getlastchangedate, fetch only when changed, add jitter, back off on 429/5xx. Never import image URLs.',
      snapshotPolicy: 'bundesliga-full',
    } as SportsSource,
    {
      id: 'openfootball', name: 'OpenFootball', homepage: 'https://github.com/openfootball', status: 'approved',
      licenseId: 'CC0-1.0', licenseUrl: 'https://github.com/openfootball/football.json/blob/master/LICENSE.md',
      sports: Object.freeze(['football']), factualDataOnly: true, logoRights: 'not-granted',
      attribution: 'Factual data: OpenFootball (CC0 1.0). Logos and photographs are not included.',
      updateIntervalHours: 24,
      automaticPolicy: 'Only verified historical completed results. No standings, unplayed fixtures, or current/live claims. Broader coverage requires reviewed registry changes; cache results and respect host rate limits.',
      snapshotPolicy: 'historical-results-only',
    } as SportsSource,
    {
      id: 'wikimedia', name: 'Wikipedia contributors', homepage: 'https://en.wikipedia.org', status: 'approved',
      licenseId: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      sports: Object.freeze(['football', 'basketball', 'baseball', 'american-football', 'ice-hockey', 'mma', 'tennis']),
      factualDataOnly: true, logoRights: 'not-granted',
      attribution: 'Adapted factual tables by Wikipedia contributors, CC BY-SA 4.0. Source revisions identify contributors; adapted datasets are shared under the same licence. Not an official league feed. Images and trademarks are excluded.',
      updateIntervalHours: null, automaticPolicy: 'Fixed reviewed pages only. Bounded manual collection and Owner review. Preserve each revision and explicit data cutoff; an edit timestamp does not prove current results.',
      snapshotPolicy: 'reviewed-community-tables',
    } as SportsSource,
    pending('nba', 'NBA', 'https://www.nba.com', ['basketball']),
    pending('euroleague', 'EuroLeague', 'https://www.euroleaguebasketball.net', ['basketball']),
    pending('mlb', 'MLB', 'https://www.mlb.com', ['baseball']),
    pending('nfl', 'NFL', 'https://www.nfl.com', ['american-football']),
    pending('nhl', 'NHL', 'https://www.nhl.com', ['ice-hockey']),
    pending('ufc', 'UFC', 'https://www.ufc.com', ['mma']),
    pending('atp', 'ATP', 'https://www.atptour.com', ['tennis']),
    pending('wta', 'WTA', 'https://www.wtatennis.com', ['tennis']),
    pending('itf', 'ITF', 'https://www.itftennis.com', ['tennis']),
  ].map(source => [source.id, Object.freeze(source)])),
);

/** Last verified result date, not the fetch date. Advancing this requires a new source audit. */
export const OPENFOOTBALL_AUDITED_THROUGH: Readonly<Record<string, string>> = Object.freeze({
  'premier-league': '2026-09-20', 'la-liga': '2026-09-20', 'serie-a': '2026-09-20', 'ligue-1': '2026-09-20',
});

export function getSportsSource(id: string): Readonly<SportsSource> | undefined {
  return Object.hasOwn(SPORTS_SOURCES, id) ? SPORTS_SOURCES[id] : undefined;
}

/** This checks provenance, not permission to fetch arbitrary URLs (no network request is made). */
export function isApprovedSourceUrl(sourceId: string, value: string): boolean {
  const source = getSportsSource(sourceId);
  if (source?.status !== 'approved' || typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    if (sourceId === 'openligadb') return ['api.openligadb.de', 'www.openligadb.de', 'openligadb.de'].includes(url.hostname);
    if (sourceId === 'wikimedia') return WIKIMEDIA_DATASETS.some(item => item.sourceUrl === url.href);
    if (sourceId === 'openfootball') {
      return (['github.com', 'raw.githubusercontent.com'].includes(url.hostname) && url.pathname.startsWith('/openfootball/'))
        || url.hostname === 'openfootball.github.io';
    }
    return false;
  } catch { return false; }
}

function openFootballResource(value: string): string | null {
  if (!isApprovedSourceUrl('openfootball', value)) return null;
  const url = new URL(value);
  if (url.search || url.pathname.includes('%')) return null;
  if (url.hostname === 'raw.githubusercontent.com') return url.pathname;
  if (url.hostname === 'github.com') return url.pathname.replace(/^(\/openfootball\/[^/]+)\/blob\//, '$1/');
  return null;
}

/** Source approval is narrow: it cannot be transferred to an unrelated competition or dataset. */
export function isApprovedSourceForCompetition(sourceId: string, competitionId: string, sport: string, sourceUrl: string, season?: string): boolean {
  const competition = catalog.find(item => item.id === competitionId);
  const source = getSportsSource(sourceId);
  if (!competition || competition.sport !== sport || source?.status !== 'approved' || !source.sports.includes(sport as SportId) || !isApprovedSourceUrl(sourceId, sourceUrl)) return false;
  const url = new URL(sourceUrl);
  if (sourceId === 'wikimedia') return WIKIMEDIA_DATASETS.some(item => item.competitionId === competitionId && item.sport === sport && item.sourceUrl === url.href && (season === undefined || item.season === season));
  if (sourceId === 'openligadb') {
    const resource = /^\/get(?:bltable|matchdata|lastchangedate)\/bl1\/(\d{4})$/.exec(url.pathname);
    if (competitionId !== 'bundesliga' || url.hostname !== 'api.openligadb.de' || url.search || !resource) return false;
    if (season === undefined) return true;
    const year = Number(resource[1]), next = String(year + 1);
    return season === `${year}/${next.slice(-2)}`;
  }
  if (sourceId === 'openfootball') {
    if (!['AVAILABLE_MANUAL', 'HISTORICAL', 'VERIFIED_ACTIVE'].includes(competition.coverageStatus)) return false;
    if (season !== undefined && season !== competition.season) return false;
    const approvedResource = openFootballResource(competition.sourceUrl);
    return approvedResource !== null && approvedResource === openFootballResource(sourceUrl);
  }
  return false;
}
