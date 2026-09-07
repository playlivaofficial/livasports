import { describe, expect, it } from 'vitest';
import type { Fixture } from '@/domain/entities';
import { FixtureStatus } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { filterFixturesForPage, groupFixtureViews, stableSortFixtures } from './fixtures';
import type { FixtureView } from './types';

function fixture(id: string, kickoff: string, status: FixtureStatus): Fixture {
  return { id: domainId<'Fixture'>(id), sportId: domainId<'Sport'>('sport'), competitionId: domainId<'Competition'>('competition'),
    seasonId: domainId<'Season'>('season'), homeTeamId: domainId<'Team'>('home'), awayTeamId: domainId<'Team'>('away'),
    kickoff: new Date(kickoff), status, homeScore: null, awayScore: null, createdAt: new Date(kickoff), updatedAt: new Date(kickoff) };
}

describe('fixture delivery rules', () => {
  it('labels live only from canonical provider status, never scheduled time', () => {
    const now = new Date('2026-09-07T20:00:00Z');
    const rows = [fixture('scheduled', '2026-09-07T19:00:00Z', FixtureStatus.SCHEDULED), fixture('live', '2026-09-07T19:00:00Z', FixtureStatus.LIVE), fixture('half', '2026-09-07T19:00:00Z', FixtureStatus.HALFTIME)];
    expect(filterFixturesForPage(rows, 'live', now, 'America/Sao_Paulo').map(row => row.id)).toEqual(['live', 'half']);
  });

  it('orders fixtures by kickoff and stable internal id', () => {
    const rows = [fixture('b', '2026-09-08T20:00:00Z', FixtureStatus.SCHEDULED), fixture('a', '2026-09-08T20:00:00Z', FixtureStatus.SCHEDULED), fixture('c', '2026-09-07T20:00:00Z', FixtureStatus.FINISHED)];
    expect(stableSortFixtures(rows).map(row => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('groups presentation fixtures by competition deterministically', () => {
    const view = (id: string, competition: string, kickoff: string): FixtureView => ({ id, competition, homeTeam: 'A', awayTeam: 'B', kickoff,
      status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, freshness: 'fresh', odds: [], oddsState: 'none' });
    const groups = groupFixtureViews([view('2', 'Liga MX', '2026-09-08T20:00:00Z'), view('1', 'Serie A', '2026-09-07T20:00:00Z'), view('0', 'Serie A', '2026-09-07T20:00:00Z')]);
    expect(groups.map(group => group.competition)).toEqual(['Liga MX', 'Serie A']);
    expect(groups[1].fixtures.map(row => row.id)).toEqual(['0', '1']);
  });
});
