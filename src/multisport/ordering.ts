import catalog from './catalog-data.json';
import type { SportsSnapshot } from './model';

/** Equivalent documented season punctuation is not a newer or older edition. */
function normalizedSeason(season: string): string {
  return season.toLowerCase().replace(/[–—]/g, '-').replace(/\b(20\d{2})[/-](?:20)?(\d{2})\b/g, '$1/$2').trim();
}
function editionYear(season: string): number {
  return Math.max(0, ...[...normalizedSeason(season).matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(match => Number(match[1])));
}
/** Prefer the catalog edition over archives whose article was edited more recently. */
export function compareSportsSnapshots(a: SportsSnapshot, b: SportsSnapshot): number {
  const competitionOrder = a.competitionId.localeCompare(b.competitionId);
  if (competitionOrder) return competitionOrder;
  const current = catalog.find(item => item.id === a.competitionId)?.season;
  const isCurrent = (snapshot: SportsSnapshot) => current ? normalizedSeason(snapshot.season) === normalizedSeason(current) : false;
  const currentOrder = Number(isCurrent(b)) - Number(isCurrent(a));
  if (currentOrder) return currentOrder;
  const historyOrder = Number(a.mode === 'historical') - Number(b.mode === 'historical');
  if (historyOrder) return historyOrder;
  const yearOrder = editionYear(b.season) - editionYear(a.season);
  if (yearOrder) return yearOrder;
  const seasonOrder = normalizedSeason(b.season).localeCompare(normalizedSeason(a.season), undefined, { numeric: true });
  if (seasonOrder) return seasonOrder;
  return b.observedAt.localeCompare(a.observedAt) || a.sourceId.localeCompare(b.sourceId) || a.sourceUrl.localeCompare(b.sourceUrl);
}
export function orderSportsSnapshots<T extends SportsSnapshot>(snapshots: readonly T[]): T[] {
  return [...snapshots].sort(compareSportsSnapshots);
}
