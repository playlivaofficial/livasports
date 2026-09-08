import type { Fixture } from '@/domain/entities';
import { FixtureStatus } from '@/domain/enums';
import type { PageKey } from '@/config/i18n';
import type { CompetitionSectionView, CompetitionView, FixtureView } from './types';
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

const groupPriority: Readonly<Record<string, number>> = { BRAZIL: 1, AMERICAS: 2, EUROPE: 3, OTHER: 4 };

export function groupFixtureViews(fixtures: readonly FixtureView[], competitions: readonly CompetitionView[] = []): CompetitionSectionView[] {
  const groups = new Map<string, { competition: string; slug: string; group: string; priority: number; fixtures: FixtureView[] }>();
  for (const competition of competitions) groups.set(competition.slug, { ...competition, fixtures: [] });
  for (const fixture of fixtures) {
    const key = fixture.competitionSlug ?? fixture.competition;
    const group = groups.get(key) ?? { competition: fixture.competition, slug: fixture.competitionSlug ?? key,
      group: fixture.competitionGroup ?? 'OTHER', priority: fixture.competitionPriority ?? 999, fixtures: [] };
    group.fixtures.push(fixture);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => (groupPriority[left.group] ?? 5) - (groupPriority[right.group] ?? 5)
      || left.priority - right.priority || left.competition.localeCompare(right.competition))
    .map(group => ({ ...group, fixtures: [...group.fixtures].sort((left, right) => left.kickoff.localeCompare(right.kickoff) || left.id.localeCompare(right.id)) }));
}
