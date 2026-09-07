import type { Fixture } from '@/domain/entities';
import { FixtureStatus } from '@/domain/enums';
import type { PageKey } from '@/config/i18n';
import type { CompetitionSectionView, FixtureView } from './types';
import { belongsToLocalDay } from './time';

export function isLiveStatus(status: FixtureStatus): boolean { return status === FixtureStatus.LIVE || status === FixtureStatus.HALFTIME; }

export function filterFixturesForPage(fixtures: readonly Fixture[], page: PageKey, now: Date, timeZone: string): Fixture[] {
  if (page === 'live') return fixtures.filter(fixture => isLiveStatus(fixture.status));
  if (page === 'home' || page === 'today') return fixtures.filter(fixture => belongsToLocalDay(fixture.kickoff, now, timeZone));
  return [...fixtures];
}

export function stableSortFixtures<T extends Pick<Fixture, 'kickoff' | 'id'>>(fixtures: readonly T[]): T[] {
  return [...fixtures].sort((left, right) => left.kickoff.getTime() - right.kickoff.getTime() || String(left.id).localeCompare(String(right.id)));
}

export function groupFixtureViews(fixtures: readonly FixtureView[]): CompetitionSectionView[] {
  const groups = new Map<string, FixtureView[]>();
  for (const fixture of fixtures) {
    const group = groups.get(fixture.competition) ?? [];
    group.push(fixture);
    groups.set(fixture.competition, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([competition, rows]) => ({
    competition,
    fixtures: [...rows].sort((left, right) => left.kickoff.localeCompare(right.kickoff) || left.id.localeCompare(right.id)),
  }));
}
