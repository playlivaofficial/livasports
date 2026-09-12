import type { Competition, Fixture, Season, Team } from '@/domain/entities';
import { FixtureStatus, ProviderCode, ProviderEntityType, TeamType } from '@/domain/enums';
import { domainId, newDomainId } from '@/domain/ids';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { SportmonksFixturePayload, SportmonksLeaguePayload, SportmonksSeasonPayload, SportmonksTeamPayload } from './types';
import { sportmonksUtc } from './utc';

const statusMap: Record<string, FixtureStatus> = {
  NS: FixtureStatus.SCHEDULED, TBA: FixtureStatus.SCHEDULED, NOT_STARTED: FixtureStatus.SCHEDULED, SCHEDULED: FixtureStatus.SCHEDULED,
  INPLAY_1ST_HALF: FixtureStatus.LIVE, INPLAY_2ND_HALF: FixtureStatus.LIVE, INPLAY_ET: FixtureStatus.LIVE,
  LIVE: FixtureStatus.LIVE, ET: FixtureStatus.LIVE, BREAK: FixtureStatus.LIVE, PENALTY_SHOOTOUT: FixtureStatus.LIVE,
  HT: FixtureStatus.HALFTIME,
  FINISHED: FixtureStatus.FINISHED, FT: FixtureStatus.FINISHED, AET: FixtureStatus.FINISHED,
  FT_PEN: FixtureStatus.FINISHED, AFTER_EXTRA_TIME: FixtureStatus.FINISHED, AFTER_PENALTIES: FixtureStatus.FINISHED,
  POSTPONED: FixtureStatus.POSTPONED, CANCELLED: FixtureStatus.CANCELLED, ABANDONED: FixtureStatus.ABANDONED,
  INTERRUPTED: FixtureStatus.ABANDONED,
};

export function mapSportmonksFixtureStatus(value: string): FixtureStatus {
  return statusMap[value.trim().toUpperCase()] ?? FixtureStatus.SCHEDULED;
}

function currentScore(raw: SportmonksFixturePayload, participantId: number): number | null {
  const participantScores = (raw.scores ?? []).filter(score => score.participant_id === participantId);
  const current = participantScores.find(score => score.description?.toUpperCase() === 'CURRENT');
  const goals = current?.score?.goals;
  return typeof goals === 'number' && Number.isFinite(goals) ? goals : null;
}

export class SportmonksNormalizer {
  constructor(private readonly mappings: ProviderMappingService) {}

  private async id(type: ProviderEntityType, providerId: string): Promise<string> {
    return (await this.mappings.getOrCreate(ProviderCode.SPORTMONKS, type, providerId, () => newDomainId())).livasportsEntityId;
  }

  async competition(raw: SportmonksLeaguePayload): Promise<Competition> {
    const id = await this.id(ProviderEntityType.COMPETITION, String(raw.id));
    const sportId = await this.id(ProviderEntityType.SPORT, String(raw.sport_id));
    const countryId = raw.country_id === null ? null : await this.id(ProviderEntityType.COUNTRY, String(raw.country_id));
    return { id: domainId<'Competition'>(id), sportId: domainId<'Sport'>(sportId), countryId: countryId ? domainId<'Country'>(countryId) : null,
      name: raw.name, slug: raw.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
  }

  async season(raw: SportmonksSeasonPayload): Promise<Season> {
    return { id: domainId<'Season'>(await this.id(ProviderEntityType.SEASON, String(raw.id))),
      competitionId: domainId<'Competition'>(await this.id(ProviderEntityType.COMPETITION, String(raw.league_id))), name: raw.name,
      startsAt: raw.starting_at ? sportmonksUtc(raw.starting_at) : null, endsAt: raw.ending_at ? sportmonksUtc(raw.ending_at) : null,
      isCurrent: raw.is_current ?? false };
  }

  async team(raw: SportmonksTeamPayload, type: TeamType = TeamType.CLUB): Promise<Team> {
    return { id: domainId<'Team'>(await this.id(ProviderEntityType.TEAM, String(raw.id))),
      sportId: domainId<'Sport'>(await this.id(ProviderEntityType.SPORT, String(raw.sport_id))),
      countryId: raw.country_id === null ? null : domainId<'Country'>(await this.id(ProviderEntityType.COUNTRY, String(raw.country_id))),
      name: raw.name, shortName: raw.short_code ?? null, imageUrl: raw.image_path ?? null, type };
  }

  async fixture(raw: SportmonksFixturePayload): Promise<Fixture> {
    const home = raw.participants?.find(participant => participant.meta?.location === 'home');
    const away = raw.participants?.find(participant => participant.meta?.location === 'away');
    if (!home || !away) throw new Error(`Sportmonks fixture ${raw.id} has no canonical home/away participants`);
    const state = raw.state?.developer_name ?? raw.state?.name ?? String(raw.state_id);
    const now = new Date();
    return {
      id: domainId<'Fixture'>(await this.id(ProviderEntityType.FIXTURE, String(raw.id))),
      sportId: domainId<'Sport'>(await this.id(ProviderEntityType.SPORT, String(raw.sport_id))),
      competitionId: domainId<'Competition'>(await this.id(ProviderEntityType.COMPETITION, String(raw.league_id))),
      seasonId: raw.season_id === null ? null : domainId<'Season'>(await this.id(ProviderEntityType.SEASON, String(raw.season_id))),
      homeTeamId: domainId<'Team'>(await this.id(ProviderEntityType.TEAM, String(home.id))),
      awayTeamId: domainId<'Team'>(await this.id(ProviderEntityType.TEAM, String(away.id))), kickoff: sportmonksUtc(raw.starting_at, raw.starting_at_timestamp),
      status: mapSportmonksFixtureStatus(state),
      homeScore: currentScore(raw, home.id), awayScore: currentScore(raw, away.id),
      createdAt: raw.created_at ? sportmonksUtc(raw.created_at) : now, updatedAt: now,
      providerUpdatedAt: raw.updated_at ? sportmonksUtc(raw.updated_at) : null,
    };
  }
}
