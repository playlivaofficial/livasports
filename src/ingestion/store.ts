import type { Competition, Country, Fixture, Season, Sport, Team } from '@/domain/entities';
import type { SeasonId } from '@/domain/ids';
import type { FootballCompetitionTarget,ProductGeo } from '@/config/footballCompetitions';
import { CompetitionCoverageStatus } from '@/domain/enums';

export interface WriteCounts { inserted: number; updated: number; }
export interface StoredCompetition {
  targetKey: string;
  competition: Competition;
  target?: FootballCompetitionTarget;
  coverageStatus?: CompetitionCoverageStatus;
  providerName?: string;
}
export interface StoredSeason extends Season { targetKey: string; }
export type SyncKind = 'FOOTBALL' | 'COMPETITIONS' | 'SEASONS' | 'TEAMS' | 'FIXTURES' | 'SCORES';

export interface SyncRun {
  id: string; syncKind: SyncKind; targetKey: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  startedAt: Date; completedAt: Date | null; inserted: number; updated: number; providerRequests: number; errorMessage: string | null;
  metadata?: Record<string, unknown>;
}

export interface FootballIngestionStore {
  upsertCountries(rows: readonly Country[]): Promise<WriteCounts>;
  upsertSport(row: Sport): Promise<WriteCounts>;
  upsertCompetitions(rows: readonly StoredCompetition[]): Promise<WriteCounts>;
  listTargetCompetitions(): Promise<StoredCompetition[]>;
  upsertSeasons(rows: readonly StoredSeason[]): Promise<WriteCounts>;
  listRelevantSeasons(): Promise<StoredSeason[]>;
  upsertTeams(rows: readonly Team[], seasonId: SeasonId): Promise<WriteCounts>;
  upsertFixtures(rows: readonly Fixture[]): Promise<WriteCounts>;
  updateCompetitionFixtureCoverage(competitionId: string, hasFixtures: boolean): Promise<void>;
  listFixturesForScoreSync(limit: number): Promise<Fixture[]>;
  startSync(kind: SyncKind, targetKey: string): Promise<string>;
  finishSync(id: string, counts: WriteCounts, providerRequests: number, metadata?: Record<string, unknown>): Promise<void>;
  failSync(id: string, safeMessage: string, providerRequests: number): Promise<void>;
}

export class InMemoryFootballIngestionStore implements FootballIngestionStore {
  readonly countries = new Map<string, Country>();
  readonly sports = new Map<string, Sport>();
  readonly competitions = new Map<string, StoredCompetition>();
  readonly seasons = new Map<string, StoredSeason>();
  readonly teams = new Map<string, Team>();
  readonly teamSeasons = new Set<string>();
  readonly fixtures = new Map<string, Fixture>();
  readonly runs = new Map<string, SyncRun>();

  private upsert<T extends { id: string }>(target: Map<string, T>, rows: readonly T[]): WriteCounts {
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      if (target.has(row.id)) updated++; else inserted++;
      target.set(row.id, structuredClone(row));
    }
    return { inserted, updated };
  }

  async upsertCountries(rows: readonly Country[]) { return this.upsert(this.countries, rows); }
  async upsertSport(row: Sport) { return this.upsert(this.sports, [row]); }
  async upsertCompetitions(rows: readonly StoredCompetition[]) {
    let inserted = 0; let updated = 0;
    for (const row of rows) {
      if (this.competitions.has(row.competition.id)) updated++; else inserted++;
      this.competitions.set(row.competition.id, structuredClone(row));
    }
    return { inserted, updated };
  }
  async listTargetCompetitions() { return [...this.competitions.values()]; }
  async upsertSeasons(rows: readonly StoredSeason[]) { return this.upsert(this.seasons, rows); }
  async listRelevantSeasons() { return [...this.seasons.values()].filter(row => row.isCurrent || !row.endsAt || row.endsAt >= new Date()); }
  async upsertTeams(rows: readonly Team[], seasonId: SeasonId) {
    const counts = this.upsert(this.teams, rows);
    for (const row of rows) this.teamSeasons.add(`${row.id}:${seasonId}`);
    return counts;
  }
  async upsertFixtures(rows: readonly Fixture[]) { return this.upsert(this.fixtures, rows); }
  async updateCompetitionFixtureCoverage(competitionId: string, hasFixtures: boolean) {
    const row = this.competitions.get(competitionId);
    if (row) row.coverageStatus = hasFixtures ? CompetitionCoverageStatus.SUPPORTED : CompetitionCoverageStatus.SUPPORTED_BUT_NO_CURRENT_FIXTURES;
  }
  async listFixturesForScoreSync(limit: number) {
    return [...this.fixtures.values()].filter(row => ['SCHEDULED', 'LIVE', 'HALFTIME'].includes(row.status)).slice(0, limit);
  }
  async startSync(syncKind: SyncKind, targetKey: string) {
    const id = crypto.randomUUID();
    this.runs.set(id, { id, syncKind, targetKey, status: 'RUNNING', startedAt: new Date(), completedAt: null,
      inserted: 0, updated: 0, providerRequests: 0, errorMessage: null, metadata: {} });
    return id;
  }
  async finishSync(id: string, counts: WriteCounts, providerRequests: number, metadata: Record<string, unknown> = {}) {
    const run = this.runs.get(id); if (!run) throw new Error('Unknown sync run');
    Object.assign(run, { status: 'SUCCEEDED', completedAt: new Date(), ...counts, providerRequests, metadata });
  }
  async failSync(id: string, safeMessage: string, providerRequests: number) {
    const run = this.runs.get(id); if (!run) throw new Error('Unknown sync run');
    Object.assign(run, { status: 'FAILED', completedAt: new Date(), errorMessage: safeMessage, providerRequests });
  }
}

export interface FixtureReadRecord {
  fixture: Fixture; competitionName: string; homeTeamName: string; awayTeamName: string;
  publicId?: string;
  competitionSlug?: string; competitionGroup?: string; competitionPriority?: number;
  homeTeamShortName?: string | null; awayTeamShortName?: string | null;
  homeTeamImageUrl?: string | null; awayTeamImageUrl?: string | null;
}

export interface CompetitionReadRecord {
  competitionName: string;
  competitionSlug: string;
  competitionGroup: string;
  competitionPriority: number;
}

export interface FootballReadRepository {
  listCompetitions(countryCode: ProductGeo): Promise<CompetitionReadRecord[]>;
  listFixtures(countryCode: ProductGeo, from: Date, to: Date, statuses?: readonly string[], competitionSlug?:string): Promise<FixtureReadRecord[]>;
}
