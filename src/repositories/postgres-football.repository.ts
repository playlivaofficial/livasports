import type { DatabaseClient, QueryExecutor } from '@/database/client';
import type { Country, Fixture, Sport, Team } from '@/domain/entities';
import { FixtureStatus } from '@/domain/enums';
import { domainId, type SeasonId } from '@/domain/ids';
import type { FootballIngestionStore, FootballReadRepository, FixtureReadRecord, StoredCompetition, StoredSeason, SyncKind, WriteCounts } from '@/ingestion/store';

async function counted(executor: QueryExecutor, sql: string, values: readonly unknown[]): Promise<'inserted' | 'updated'> {
  const result = await executor.query<{ inserted: boolean }>(sql, values);
  return result.rows[0]?.inserted ? 'inserted' : 'updated';
}

async function many<T>(database: DatabaseClient, rows: readonly T[], write: (client: QueryExecutor, row: T) => Promise<'inserted' | 'updated'>): Promise<WriteCounts> {
  return database.transaction(async client => {
    const counts = { inserted: 0, updated: 0 };
    for (const row of rows) counts[await write(client, row)]++;
    return counts;
  });
}

export class PostgresFootballRepository implements FootballIngestionStore, FootballReadRepository {
  constructor(private readonly database: DatabaseClient) {}

  upsertCountries(rows: readonly Country[]) {
    return many(this.database, rows, (db, row) => counted(db, `INSERT INTO countries (id, iso2, name) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET iso2=EXCLUDED.iso2, name=EXCLUDED.name, updated_at=now() RETURNING xmax = 0 AS inserted`,
    [row.id, row.code, row.name]));
  }

  upsertSport(row: Sport) {
    return many(this.database, [row], (db, item) => counted(db, `INSERT INTO sports (id, code, name) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name, updated_at=now() RETURNING xmax = 0 AS inserted`,
    [item.id, item.code, item.name]));
  }

  upsertCompetitions(rows: readonly StoredCompetition[]) {
    return many(this.database, rows, (db, row) => counted(db, `INSERT INTO competitions (id, sport_id, country_id, name, slug)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET sport_id=EXCLUDED.sport_id, country_id=EXCLUDED.country_id,
      name=EXCLUDED.name, slug=EXCLUDED.slug, updated_at=now() RETURNING xmax = 0 AS inserted`,
    [row.competition.id, row.competition.sportId, row.competition.countryId, row.competition.name, row.competition.slug]));
  }

  async listTargetCompetitions(): Promise<StoredCompetition[]> {
    const result = await this.database.query<{ id: string; sport_id: string; country_id: string | null; name: string; slug: string }>(
      `SELECT id,sport_id,country_id,name,slug FROM competitions WHERE slug IN ('brasileiro-serie-a','copa-do-brasil','copa-libertadores','liga-mx') ORDER BY slug`,
    );
    return result.rows.map(row => ({ targetKey: row.slug, competition: { id: domainId<'Competition'>(row.id), sportId: domainId<'Sport'>(row.sport_id),
      countryId: row.country_id ? domainId<'Country'>(row.country_id) : null, name: row.name, slug: row.slug } }));
  }

  upsertSeasons(rows: readonly StoredSeason[]) {
    return many(this.database, rows, (db, row) => counted(db, `INSERT INTO seasons (id,competition_id,name,starts_at,ends_at,is_current)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET competition_id=EXCLUDED.competition_id,name=EXCLUDED.name,
      starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,is_current=EXCLUDED.is_current,updated_at=now() RETURNING xmax = 0 AS inserted`,
    [row.id, row.competitionId, row.name, row.startsAt, row.endsAt, row.isCurrent ?? false]));
  }

  async listRelevantSeasons(): Promise<StoredSeason[]> {
    const result = await this.database.query<{ id: string; competition_id: string; name: string; starts_at: Date | null; ends_at: Date | null; is_current: boolean; slug: string }>(
      `SELECT s.id,s.competition_id,s.name,s.starts_at,s.ends_at,s.is_current,c.slug FROM seasons s JOIN competitions c ON c.id=s.competition_id
       WHERE s.is_current OR s.ends_at IS NULL OR s.ends_at >= now() ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST`,
    );
    return result.rows.map(row => ({ id: domainId<'Season'>(row.id), competitionId: domainId<'Competition'>(row.competition_id),
      name: row.name, startsAt: row.starts_at ? new Date(row.starts_at) : null, endsAt: row.ends_at ? new Date(row.ends_at) : null,
      isCurrent: row.is_current, targetKey: row.slug }));
  }

  upsertTeams(rows: readonly Team[], seasonId: SeasonId) {
    return this.database.transaction(async db => {
      const counts = { inserted: 0, updated: 0 };
      for (const row of rows) {
        const kind = await counted(db, `INSERT INTO teams (id,sport_id,country_id,name,short_name,image_url) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET sport_id=EXCLUDED.sport_id,country_id=EXCLUDED.country_id,name=EXCLUDED.name,
          short_name=EXCLUDED.short_name,image_url=EXCLUDED.image_url,updated_at=now() RETURNING xmax = 0 AS inserted`,
        [row.id, row.sportId, row.countryId, row.name, row.shortName, row.imageUrl ?? null]);
        counts[kind]++;
        await db.query('INSERT INTO team_seasons (team_id,season_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.id, seasonId]);
      }
      return counts;
    });
  }

  upsertFixtures(rows: readonly Fixture[]) {
    return many(this.database, rows, (db, row) => counted(db, `INSERT INTO fixtures
      (id,sport_id,competition_id,season_id,home_team_id,away_team_id,kickoff,status,home_score,away_score,created_at,updated_at,provider_updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12) ON CONFLICT (id) DO UPDATE SET
      sport_id=EXCLUDED.sport_id,competition_id=EXCLUDED.competition_id,season_id=EXCLUDED.season_id,home_team_id=EXCLUDED.home_team_id,
      away_team_id=EXCLUDED.away_team_id,kickoff=EXCLUDED.kickoff,status=EXCLUDED.status,home_score=EXCLUDED.home_score,
      away_score=EXCLUDED.away_score,provider_updated_at=EXCLUDED.provider_updated_at,updated_at=now() RETURNING xmax = 0 AS inserted`,
    [row.id,row.sportId,row.competitionId,row.seasonId,row.homeTeamId,row.awayTeamId,row.kickoff,row.status,row.homeScore,row.awayScore,row.createdAt,row.providerUpdatedAt ?? null]));
  }

  async listFixturesForScoreSync(limit: number): Promise<Fixture[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT * FROM fixtures WHERE status IN ('SCHEDULED','LIVE','HALFTIME')
      AND kickoff >= now() - interval '2 days' AND kickoff < now() + interval '2 days' ORDER BY kickoff LIMIT $1`, [limit]);
    return result.rows.map(row => this.fixture(row));
  }

  async startSync(syncKind: SyncKind, targetKey: string): Promise<string> {
    const result = await this.database.query<{ id: string }>('INSERT INTO ingestion_sync_runs (sync_kind,target_key,status) VALUES ($1,$2,\'RUNNING\') RETURNING id', [syncKind, targetKey]);
    return result.rows[0].id;
  }
  async finishSync(id: string, counts: WriteCounts, providerRequests: number) {
    await this.database.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now(),records_inserted=$2,records_updated=$3,provider_requests=$4 WHERE id=$1`, [id, counts.inserted, counts.updated, providerRequests]);
  }
  async failSync(id: string, safeMessage: string, providerRequests: number) {
    await this.database.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message=$2,provider_requests=$3 WHERE id=$1`, [id, safeMessage, providerRequests]);
  }

  async listFixtures(countryCode: 'BR' | 'MX', from: Date, to: Date, statuses: readonly string[] = []): Promise<FixtureReadRecord[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT f.id,f.sport_id,f.competition_id,f.season_id,f.home_team_id,f.away_team_id,
      f.kickoff,f.status,f.home_score,f.away_score,f.created_at,f.updated_at,f.provider_updated_at,
      c.name AS competition_name,ht.name AS home_team_name,ht.short_name AS home_team_short_name,ht.image_url AS home_team_image_url,
      at.name AS away_team_name,at.short_name AS away_team_short_name,at.image_url AS away_team_image_url
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN countries co ON co.id=c.country_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE co.iso2=$1 AND f.kickoff >= $2 AND f.kickoff < $3 AND (cardinality($4::text[]) = 0 OR f.status = ANY($4::text[]))
      ORDER BY f.kickoff,f.id`, [countryCode, from, to, statuses]);
    return result.rows.map(row => ({ fixture: this.fixture(row), competitionName: String(row.competition_name),
      homeTeamName: String(row.home_team_name), homeTeamShortName: row.home_team_short_name ? String(row.home_team_short_name) : null,
      homeTeamImageUrl: row.home_team_image_url ? String(row.home_team_image_url) : null,
      awayTeamName: String(row.away_team_name), awayTeamShortName: row.away_team_short_name ? String(row.away_team_short_name) : null,
      awayTeamImageUrl: row.away_team_image_url ? String(row.away_team_image_url) : null }));
  }

  private fixture(row: Record<string, unknown>): Fixture {
    return { id: domainId<'Fixture'>(String(row.id)), sportId: domainId<'Sport'>(String(row.sport_id)),
      competitionId: domainId<'Competition'>(String(row.competition_id)), seasonId: row.season_id ? domainId<'Season'>(String(row.season_id)) : null,
      homeTeamId: domainId<'Team'>(String(row.home_team_id)), awayTeamId: domainId<'Team'>(String(row.away_team_id)),
      kickoff: new Date(String(row.kickoff)), status: row.status as FixtureStatus, homeScore: row.home_score === null ? null : Number(row.home_score),
      awayScore: row.away_score === null ? null : Number(row.away_score), createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)),
      providerUpdatedAt: row.provider_updated_at ? new Date(String(row.provider_updated_at)) : null };
  }
}
