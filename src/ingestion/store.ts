import type { Competition, Country, Fixture, Season, Sport, Team } from '@/domain/entities';
import type { SeasonId } from '@/domain/ids';

export interface WriteCounts { inserted: number; updated: number; }
export interface StoredCompetition { targetKey: string; competition: Competition; }
export interface StoredSeason extends Season { targetKey: string; }
export type SyncKind = 'FOOTBALL' | 'COMPETITIONS' | 'SEASONS' | 'TEAMS' | 'FIXTURES' | 'SCORES';

export interface SyncRun {
  id: string; syncKind: SyncKind; targetKey: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  startedAt: Date; completedAt: Date | null; inserted: number; updated: number; providerRequests: number; errorMessage: string | null;
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
  listFixturesForScoreSync(limit: number): Promise<Fixture[]>;
  startSync(kind: SyncKind, targetKey: string): Promise<string>;
  finishSync(id: string, counts: WriteCounts, providerRequests: number): Promise<void>;
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
  async listFixturesForScoreSync(limit: number) {
    return [...this.fixtures.values()].filter(row => ['SCHEDULED', 'LIVE', 'HALFTIME'].includes(row.status)).slice(0, limit);
  }
  async startSync(syncKind: SyncKind, targetKey: string) {
    const id = crypto.randomUUID();
    this.runs.set(id, { id, syncKind, targetKey, status: 'RUNNING', startedAt: new Date(), completedAt: null,
      inserted: 0, updated: 0, providerRequests: 0, errorMessage: null });
    return id;
  }
  async finishSync(id: string, counts: WriteCounts, providerRequests: number) {
    const run = this.runs.get(id); if (!run) throw new Error('Unknown sync run');
    Object.assign(run, { status: 'SUCCEEDED', completedAt: new Date(), ...counts, providerRequests });
  }
  async failSync(id: string, safeMessage: string, providerRequests: number) {
    const run = this.runs.get(id); if (!run) throw new Error('Unknown sync run');
    Object.assign(run, { status: 'FAILED', completedAt: new Date(), errorMessage: safeMessage, providerRequests });
  }
}

export interface FixtureReadRecord {
  fixture: Fixture; competitionName: string; homeTeamName: string; awayTeamName: string;
}

export interface FootballReadRepository {
  listFixtures(countryCode: 'BR' | 'MX', from: Date, to: Date): Promise<FixtureReadRecord[]>;
}
