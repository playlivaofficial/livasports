import type {
  Competition, Fixture, LineupEntry, MatchEvent, MatchStatistic, Season, StandingRow, Team,
} from '@/domain/entities';
import type { CompetitionId, FixtureId, SeasonId } from '@/domain/ids';

export interface FixtureQuery { from: Date; to: Date; competitionIds?: readonly CompetitionId[]; }

export interface SportsDataProvider {
  getCompetitions(countryCodes?: readonly string[]): Promise<Competition[]>;
  getSeasons(competitionId: CompetitionId): Promise<Season[]>;
  getTeams(seasonId: SeasonId): Promise<Team[]>;
  getFixtures(query: FixtureQuery): Promise<Fixture[]>;
  getFixture(fixtureId: FixtureId): Promise<Fixture | null>;
  getScores(fixtureIds: readonly FixtureId[]): Promise<Fixture[]>;
  getEvents(fixtureId: FixtureId): Promise<MatchEvent[]>;
  getStandings(seasonId: SeasonId): Promise<StandingRow[]>;
  getLineups(fixtureId: FixtureId): Promise<LineupEntry[]>;
  getStatistics(fixtureId: FixtureId): Promise<MatchStatistic[]>;
  getHeadToHead(homeTeamId: string, awayTeamId: string): Promise<Fixture[]>;
}
