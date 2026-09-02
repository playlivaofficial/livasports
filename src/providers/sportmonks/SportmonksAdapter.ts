import type { LineupEntry, MatchEvent, MatchStatistic, StandingRow } from '@/domain/entities';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId, type CompetitionId, type FixtureId, type SeasonId } from '@/domain/ids';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { FixtureQuery, SportsDataProvider } from '@/providers/contracts/SportsDataProvider';
import { SportmonksNormalizer } from './normalizer';
import type { SportmonksGateway } from './types';

export class SportmonksAdapter implements SportsDataProvider {
  private readonly normalizer: SportmonksNormalizer;

  constructor(private readonly gateway: SportmonksGateway, private readonly mappings: ProviderMappingService) {
    this.normalizer = new SportmonksNormalizer(mappings);
  }

  private async providerId(type: ProviderEntityType, livasportsId: string): Promise<string> {
    const providerId = await this.mappings.lookupProviderId(ProviderCode.SPORTMONKS, type, livasportsId);
    if (!providerId) throw new Error(`No Sportmonks ${type} mapping exists for ${livasportsId}`);
    return providerId;
  }

  async getCompetitions(countryCodes?: readonly string[]) {
    return Promise.all((await this.gateway.competitions(countryCodes)).map(raw => this.normalizer.competition(raw)));
  }

  async getSeasons(competitionId: CompetitionId) {
    const providerId = await this.providerId(ProviderEntityType.COMPETITION, competitionId);
    return Promise.all((await this.gateway.seasons(providerId)).map(raw => this.normalizer.season(raw)));
  }

  async getTeams(seasonId: SeasonId) {
    const providerId = await this.providerId(ProviderEntityType.SEASON, seasonId);
    return Promise.all((await this.gateway.teams(providerId)).map(raw => this.normalizer.team(raw)));
  }

  async getFixtures(query: FixtureQuery) {
    const competitionIds = query.competitionIds
      ? await Promise.all(query.competitionIds.map(id => this.providerId(ProviderEntityType.COMPETITION, id))) : undefined;
    return Promise.all((await this.gateway.fixtures(query.from, query.to, competitionIds)).map(raw => this.normalizer.fixture(raw)));
  }

  async getFixture(fixtureId: FixtureId) {
    const raw = await this.gateway.fixture(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    return raw ? this.normalizer.fixture(raw) : null;
  }

  async getScores(fixtureIds: readonly FixtureId[]) {
    const ids = await Promise.all(fixtureIds.map(id => this.providerId(ProviderEntityType.FIXTURE, id)));
    return Promise.all((await this.gateway.scores(ids)).map(raw => this.normalizer.fixture(raw)));
  }

  async getEvents(fixtureId: FixtureId): Promise<MatchEvent[]> {
    const rows = await this.gateway.events(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    const events: MatchEvent[] = [];
    for (const row of rows) {
      const value = row as Record<string, unknown>;
      const teamMapping = typeof value.participant_id === 'number'
        ? await this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.participant_id)) : null;
      events.push({ fixtureId, type: String(value.type ?? value.name ?? 'UNKNOWN'), minute: typeof value.minute === 'number' ? value.minute : null,
        teamId: teamMapping ? domainId<'Team'>(teamMapping.livasportsEntityId) : null,
        detail: typeof value.detail === 'string' ? value.detail : null });
    }
    return events;
  }

  async getStandings(seasonId: SeasonId): Promise<StandingRow[]> {
    const rows = await this.gateway.standings(await this.providerId(ProviderEntityType.SEASON, seasonId));
    const standings: StandingRow[] = [];
    for (const row of rows) {
      const value = row as Record<string, unknown>;
      if (typeof value.participant_id !== 'number' || typeof value.league_id !== 'number' || typeof value.position !== 'number') continue;
      const [team, competition] = await Promise.all([
        this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.participant_id)),
        this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, String(value.league_id)),
      ]);
      if (!team || !competition) continue;
      standings.push({ competitionId: domainId<'Competition'>(competition.livasportsEntityId), seasonId,
        teamId: domainId<'Team'>(team.livasportsEntityId), position: value.position,
        played: Number(value.played ?? 0), points: Number(value.points ?? 0) });
    }
    return standings;
  }

  async getLineups(fixtureId: FixtureId): Promise<LineupEntry[]> {
    const rows = await this.gateway.lineups(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    const lineups: LineupEntry[] = [];
    for (const row of rows) {
      const value = row as Record<string, unknown>;
      if (typeof value.player_name !== 'string' || typeof value.team_id !== 'number') continue;
      const team = await this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.team_id));
      if (!team) continue;
      lineups.push({ fixtureId, teamId: domainId<'Team'>(team.livasportsEntityId), participantName: value.player_name,
        position: typeof value.position === 'string' ? value.position : null, starter: Boolean(value.starter) });
    }
    return lineups;
  }

  async getStatistics(fixtureId: FixtureId): Promise<MatchStatistic[]> {
    const rows = await this.gateway.statistics(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    return rows.flatMap(row => {
      const value = row as Record<string, unknown>;
      if (typeof value.type !== 'string' || (typeof value.value !== 'string' && typeof value.value !== 'number')) return [];
      return [{ fixtureId, teamId: null, type: value.type, value: value.value }];
    });
  }

  async getHeadToHead(homeTeamId: string, awayTeamId: string) {
    const [home, away] = await Promise.all([
      this.providerId(ProviderEntityType.TEAM, homeTeamId), this.providerId(ProviderEntityType.TEAM, awayTeamId),
    ]);
    return Promise.all((await this.gateway.headToHead(home, away)).map(raw => this.normalizer.fixture(raw)));
  }
}
