import type { Bookmaker, Competition, Fixture, OddsQuote, Team } from '@/domain/entities';
import type { BookmakerId, CompetitionId, FixtureId, TeamId } from '@/domain/ids';

export interface CompetitionRepository {
  list(): Promise<Competition[]>;
  findById(id: CompetitionId): Promise<Competition | null>;
  upsertMany(competitions: readonly Competition[]): Promise<void>;
}

export interface FixtureRepository {
  listBetween(from: Date, to: Date): Promise<Fixture[]>;
  findById(id: FixtureId): Promise<Fixture | null>;
  upsertMany(fixtures: readonly Fixture[]): Promise<void>;
}

export interface TeamRepository {
  findById(id: TeamId): Promise<Team | null>;
  upsertMany(teams: readonly Team[]): Promise<void>;
}

export interface BookmakerRepository {
  listEnabledForCountry(countryCode: string): Promise<Bookmaker[]>;
  findById(id: BookmakerId): Promise<Bookmaker | null>;
}

export interface OddsRepository {
  listCurrentForFixtures(fixtureIds: readonly FixtureId[]): Promise<OddsQuote[]>;
  replaceCurrent(quotes: readonly OddsQuote[]): Promise<void>;
  appendHistory(quotes: readonly OddsQuote[]): Promise<void>;
}
