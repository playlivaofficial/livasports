import type {
  BookmakerId, CompetitionId, CountryId, FixtureId, MarketId, OddsQuoteId, SeasonId, SportId, TeamId,
} from './ids';
import { AffiliateStatus, FixtureStatus, MarketCode, OddsQuoteStatus, OutcomeCode, TeamType } from './enums';

export interface Country { id: CountryId; code: string; name: string; }
export interface Sport { id: SportId; code: string; name: string; }
export interface Competition { id: CompetitionId; sportId: SportId; countryId: CountryId | null; name: string; slug: string; }
export interface Season { id: SeasonId; competitionId: CompetitionId; name: string; startsAt: Date | null; endsAt: Date | null; isCurrent?: boolean; }
export interface Team { id: TeamId; sportId: SportId; countryId: CountryId | null; name: string; shortName: string | null; imageUrl?: string | null; type?: TeamType; }

export interface Fixture {
  id: FixtureId;
  sportId: SportId;
  competitionId: CompetitionId;
  seasonId: SeasonId | null;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  kickoff: Date;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  createdAt: Date;
  updatedAt: Date;
  providerUpdatedAt?: Date | null;
}

export interface Bookmaker {
  id: BookmakerId;
  providerSlug: string;
  displayName: string;
  enabled: boolean;
  comparisonEnabled: boolean;
  affiliateStatus: AffiliateStatus;
  affiliateUrl: string | null;
  logoRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Market {
  id: MarketId;
  code: MarketCode;
  displayName: string;
  requiresLine: boolean;
  enabled: boolean;
}

export interface Outcome {
  market: MarketCode;
  code: OutcomeCode;
  displayName: string;
}

export interface BookmakerGeoAvailability {
  bookmakerId: BookmakerId;
  countryId: CountryId;
  oddsEnabled: boolean;
  comparisonEnabled: boolean;
  affiliateEnabled: boolean;
  verifiedAt: Date | null;
}

export interface OddsQuote {
  id: OddsQuoteId;
  fixtureId: FixtureId;
  bookmakerId: BookmakerId;
  market: MarketCode;
  outcome: OutcomeCode;
  line: number | null;
  decimalOdds: number;
  providerUpdatedAt: Date;
  receivedAt: Date;
  status: OddsQuoteStatus;
}

export interface CanonicalSelection {
  fixtureId: FixtureId;
  market: MarketCode;
  outcome: OutcomeCode;
  line: number | null;
}

export interface MatchEvent { fixtureId: FixtureId; type: string; minute: number | null; teamId: TeamId | null; detail: string | null; }
export interface StandingRow { competitionId: CompetitionId; seasonId: SeasonId; teamId: TeamId; position: number; played: number; points: number; }
export interface LineupEntry { fixtureId: FixtureId; teamId: TeamId; participantName: string; position: string | null; starter: boolean; }
export interface MatchStatistic { fixtureId: FixtureId; teamId: TeamId | null; type: string; value: number | string; }
