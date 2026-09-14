import type { FixtureStatus } from '@/domain/enums';
import type { SiteLocale } from '@/config/i18n';

export type ProfileModuleState = 'AVAILABLE' | 'PARTIAL' | 'NOT_YET_INGESTED' | 'NOT_COVERED' | 'NOT_APPLICABLE' | 'ERROR' | 'STALE';
export type ProfileEntityType = 'TEAM' | 'PLAYER';

export interface ProfileModule<T> {
  state: ProfileModuleState;
  data: T;
  providerUpdatedAt: string | null;
  lastSuccessfulRefreshAt: string | null;
}

export interface ProfileCompetitionContext {
  competitionId: string;
  competition: string;
  competitionSlug: string;
  competitionType: string;
  seasonId: string;
  season: string;
  isCurrent: boolean;
}

export interface ProfileFixture {
  id: string;
  publicId: string;
  competition: string;
  kickoff: string;
  status: FixtureStatus;
  home: { id: string; publicId: string; name: string; imageUrl: string | null };
  away: { id: string; publicId: string; name: string; imageUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
}

export interface ProfileStanding {
  competition: string;
  season: string;
  stage: string | null;
  group: string | null;
  position: number;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  points: number | null;
}

export interface ProfileStatistic {
  competitionId: string;
  competition: string;
  seasonId: string;
  season: string;
  teamId: string | null;
  team: string | null;
  sourceTeamKey?: string;
  typeId: number;
  code: string;
  label: string;
  value: number | string;
  unit: string | null;
}

export interface SquadPlayer {
  id: string;
  publicId: string;
  name: string;
  imageUrl: string | null;
  positionId: number | null;
  position: string | null;
  jerseyNumber: number | null;
}

export interface SquadContext {
  competition: string;
  season: string;
  seasonId: string;
  players: SquadPlayer[];
}

export interface TeamProfileView {
  entityType: 'TEAM';
  id: string;
  publicId: string;
  locale: SiteLocale;
  name: string;
  shortName: string | null;
  imageUrl: string | null;
  country: string | null;
  foundedYear: number | null;
  venue: string | null;
  venueCity: string | null;
  coach: string | null;
  competitions: ProfileCompetitionContext[];
  upcoming: ProfileFixture[];
  recent: ProfileFixture[];
  standings: ProfileModule<ProfileStanding[]>;
  squad: ProfileModule<SquadContext[]>;
  statistics: ProfileModule<ProfileStatistic[]>;
  lastModifiedAt: string;
  indexable: boolean;
  providerRequests: 0;
}

export interface PlayerMatchLog extends ProfileFixture {
  playerTeamId: string;
  opponent: string;
  starter: boolean | null;
  jerseyNumber: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  minutesPlayed: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  saves: number | null;
  rating: number | null;
}

export interface PlayerProfileView {
  entityType: 'PLAYER';
  id: string;
  publicId: string;
  locale: SiteLocale;
  name: string;
  commonName: string | null;
  imageUrl: string | null;
  nationality: string | null;
  country: string | null;
  position: string | null;
  detailedPosition: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  currentTeam: { id: string; publicId: string; name: string; imageUrl: string | null } | null;
  contexts: Array<ProfileCompetitionContext & { teamId: string; teamPublicId: string; team: string }>;
  statistics: ProfileModule<ProfileStatistic[]>;
  matches: ProfileModule<PlayerMatchLog[]>;
  lastModifiedAt: string;
  indexable: boolean;
  providerRequests: 0;
}

export interface SponsorCampaign {
  id: string;
  placement: string;
  label: string;
  imageUrl: string;
  imageAlt: string;
  destinationUrl: string;
}

export type TeamProfileReadResult = { kind: 'found'; profile: TeamProfileView } | { kind: 'not-found' };
export type PlayerProfileReadResult = { kind: 'found'; profile: PlayerProfileView } | { kind: 'not-found' };
