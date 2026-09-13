import type { DatabaseClient, QueryExecutor } from '@/database/client';
import type { Country, Fixture, Sport, Team } from '@/domain/entities';
import { CompetitionCoverageStatus, CompetitionType, FixtureStatus, TeamType } from '@/domain/enums';
import { domainId, type SeasonId } from '@/domain/ids';
import type { CompetitionReadRecord, FootballIngestionStore, FootballReadRepository, FixtureReadRecord, StoredCompetition, StoredSeason, SyncKind, WriteCounts } from '@/ingestion/store';
import { targetBySlug } from '@/config/footballCompetitions';

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

  async findCountryByCode(code: string): Promise<Country | null> {
    const result = await this.database.query<{ id: string; iso2: string; name: string }>(
      'SELECT id,iso2,name FROM countries WHERE iso2=$1', [code.toUpperCase()],
    );
    const row = result.rows[0];
    return row ? { id: domainId<'Country'>(row.id), code: row.iso2, name: row.name } : null;
  }

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
    return many(this.database, rows, (db, row) => {
      const target = row.target;
      return counted(db, `INSERT INTO competitions
        (id,sport_id,country_id,name,slug,canonical_name,display_name_pt_br,display_name_es_mx,competition_type,region,
         competition_group,enabled,coverage_status,priority_br,priority_mx,season_strategy)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET sport_id=EXCLUDED.sport_id,country_id=EXCLUDED.country_id,name=EXCLUDED.name,
        slug=EXCLUDED.slug,canonical_name=EXCLUDED.canonical_name,display_name_pt_br=EXCLUDED.display_name_pt_br,
        display_name_es_mx=EXCLUDED.display_name_es_mx,competition_type=EXCLUDED.competition_type,region=EXCLUDED.region,
        competition_group=EXCLUDED.competition_group,enabled=EXCLUDED.enabled,coverage_status=EXCLUDED.coverage_status,
        priority_br=EXCLUDED.priority_br,priority_mx=EXCLUDED.priority_mx,season_strategy=EXCLUDED.season_strategy,updated_at=now()
        RETURNING xmax = 0 AS inserted`,
      [row.competition.id, row.competition.sportId, row.competition.countryId, row.competition.name, row.competition.slug,
        target?.canonicalName ?? row.competition.name, target?.displayNames.br ?? row.competition.name,
        target?.displayNames.mx ?? row.competition.name, target?.type ?? CompetitionType.DOMESTIC_LEAGUE,
        target?.region ?? (row.competition.countryId ? 'SOUTH_AMERICA' : 'GLOBAL'), target?.group ?? 'BRAZIL',
        target?.enabled ?? true, row.coverageStatus ?? CompetitionCoverageStatus.SUPPORTED,
        target?.priority.br ?? 999, target?.priority.mx ?? 999, target?.seasonStrategy ?? 'STANDARD']);
    });
  }

  async listTargetCompetitions(): Promise<StoredCompetition[]> {
    const result = await this.database.query<{ id: string; sport_id: string; country_id: string | null; name: string; slug: string; coverage_status: CompetitionCoverageStatus }>(
      `SELECT id,sport_id,country_id,name,slug,coverage_status FROM competitions
       WHERE enabled AND coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES') ORDER BY priority_br,slug`,
    );
    return result.rows.map(row => ({ targetKey: targetBySlug(row.slug)?.key ?? row.slug,
      target: targetBySlug(row.slug), coverageStatus: row.coverage_status,
      competition: { id: domainId<'Competition'>(row.id), sportId: domainId<'Sport'>(row.sport_id),
        countryId: row.country_id ? domainId<'Country'>(row.country_id) : null, name: row.name, slug: row.slug } }));
  }

  upsertSeasons(rows: readonly StoredSeason[]) {
    return this.database.transaction(async db => {
      const competitionIds = [...new Set(rows.map(row => row.competitionId))];
      if (competitionIds.length) await db.query('UPDATE seasons SET is_current=false,updated_at=now() WHERE competition_id = ANY($1::uuid[]) AND is_current', [competitionIds]);
      const counts = { inserted: 0, updated: 0 };
      for (const row of rows) {
        const kind = await counted(db, `INSERT INTO seasons (id,competition_id,name,starts_at,ends_at,is_current)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET competition_id=EXCLUDED.competition_id,name=EXCLUDED.name,
          starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,is_current=EXCLUDED.is_current,updated_at=now() RETURNING xmax = 0 AS inserted`,
        [row.id, row.competitionId, row.name, row.startsAt, row.endsAt, row.isCurrent ?? false]);
        counts[kind]++;
      }
      return counts;
    });
  }

  async listRelevantSeasons(): Promise<StoredSeason[]> {
    const result = await this.database.query<{ id: string; competition_id: string; name: string; starts_at: Date | null; ends_at: Date | null; is_current: boolean; slug: string }>(
      `SELECT s.id,s.competition_id,s.name,s.starts_at,s.ends_at,s.is_current,c.slug FROM seasons s JOIN competitions c ON c.id=s.competition_id
       WHERE c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')
       AND (s.is_current OR (NOT EXISTS (SELECT 1 FROM seasons current_season
         WHERE current_season.competition_id=s.competition_id AND current_season.is_current)
         AND (s.ends_at IS NULL OR s.ends_at >= now())))
       ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST`,
    );
    return result.rows.map(row => ({ id: domainId<'Season'>(row.id), competitionId: domainId<'Competition'>(row.competition_id),
      name: row.name, startsAt: row.starts_at ? new Date(row.starts_at) : null, endsAt: row.ends_at ? new Date(row.ends_at) : null,
      isCurrent: row.is_current, targetKey: row.slug }));
  }

  upsertTeams(rows: readonly Team[], seasonId: SeasonId) {
    if (!rows.length) return Promise.resolve({ inserted: 0, updated: 0 });
    return this.database.transaction(async db => {
      const payload = rows.map(row => ({ id: row.id, sport_id: row.sportId, country_id: row.countryId,
        name: row.name, short_name: row.shortName, image_url: row.imageUrl ?? null, team_type: row.type ?? TeamType.CLUB }));
      const result = await db.query<{ inserted: boolean }>(`WITH input AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
            id uuid,sport_id uuid,country_id uuid,name text,short_name text,image_url text,team_type text)
        ) INSERT INTO teams (id,sport_id,country_id,name,short_name,image_url,team_type)
        SELECT id,sport_id,country_id,name,short_name,image_url,team_type FROM input
        ON CONFLICT (id) DO UPDATE SET sport_id=EXCLUDED.sport_id,country_id=EXCLUDED.country_id,name=EXCLUDED.name,
          short_name=EXCLUDED.short_name,image_url=EXCLUDED.image_url,team_type=EXCLUDED.team_type,updated_at=now()
        RETURNING xmax = 0 AS inserted`, [JSON.stringify(payload)]);
      await db.query(`INSERT INTO team_seasons (team_id,season_id)
        SELECT unnest($1::uuid[]),$2::uuid ON CONFLICT DO NOTHING`, [rows.map(row => row.id), seasonId]);
      const inserted = result.rows.filter(row => row.inserted).length;
      return { inserted, updated: result.rows.length - inserted };
    });
  }

  upsertFixtures(rows: readonly Fixture[]) {
    if (!rows.length) return Promise.resolve({ inserted: 0, updated: 0 });
    return this.database.transaction(async db => {
      const payload = rows.map(row => ({ id: row.id, sport_id: row.sportId, competition_id: row.competitionId,
        season_id: row.seasonId, home_team_id: row.homeTeamId, away_team_id: row.awayTeamId,
        kickoff: row.kickoff.toISOString(), status: row.status, home_score: row.homeScore, away_score: row.awayScore,
        created_at: row.createdAt.toISOString(), provider_updated_at: row.providerUpdatedAt?.toISOString() ?? null }));
      const result = await db.query<{ inserted: boolean }>(`WITH input AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
            id uuid,sport_id uuid,competition_id uuid,season_id uuid,home_team_id uuid,away_team_id uuid,
            kickoff timestamptz,status text,home_score integer,away_score integer,created_at timestamptz,provider_updated_at timestamptz)
        ) INSERT INTO fixtures
          (id,sport_id,competition_id,season_id,home_team_id,away_team_id,kickoff,status,home_score,away_score,created_at,updated_at,provider_updated_at)
        SELECT id,sport_id,competition_id,season_id,home_team_id,away_team_id,kickoff,status,home_score,away_score,created_at,now(),provider_updated_at FROM input
        ON CONFLICT (id) DO UPDATE SET sport_id=EXCLUDED.sport_id,competition_id=EXCLUDED.competition_id,
          season_id=EXCLUDED.season_id,home_team_id=EXCLUDED.home_team_id,away_team_id=EXCLUDED.away_team_id,
          kickoff=EXCLUDED.kickoff,status=EXCLUDED.status,home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,
          provider_updated_at=EXCLUDED.provider_updated_at,updated_at=now() RETURNING xmax = 0 AS inserted`,
      [JSON.stringify(payload)]);
      const inserted = result.rows.filter(row => row.inserted).length;
      return { inserted, updated: result.rows.length - inserted };
    });
  }

  async updateCompetitionFixtureCoverage(competitionId: string, hasFixtures: boolean) {
    await this.database.query('UPDATE competitions SET coverage_status=$2,updated_at=now() WHERE id=$1', [competitionId,
      hasFixtures ? CompetitionCoverageStatus.SUPPORTED : CompetitionCoverageStatus.SUPPORTED_BUT_NO_CURRENT_FIXTURES]);
  }

  async listFixturesForScoreSync(limit: number): Promise<Fixture[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT * FROM fixtures WHERE status IN ('SCHEDULED','LIVE','HALFTIME')
      AND kickoff >= now() - interval '2 days' AND kickoff < now() + interval '2 days'
      ORDER BY CASE WHEN kickoff BETWEEN now()-interval '3 hours' AND now()+interval '10 minutes' THEN 0 ELSE 1 END,
        updated_at ASC,kickoff LIMIT $1`, [limit]);
    return result.rows.map(row => this.fixture(row));
  }

  async startSync(syncKind: SyncKind, targetKey: string): Promise<string> {
    return this.database.transaction(async db => {
      await db.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),
        error_message=COALESCE(error_message,'Interrupted process was not active when a replacement sync began.')
        WHERE sync_kind=$1 AND status='RUNNING' AND started_at < now() - interval '30 minutes'`, [syncKind]);
      const result = await db.query<{ id: string }>(
        'INSERT INTO ingestion_sync_runs (sync_kind,target_key,status) VALUES ($1,$2,\'RUNNING\') RETURNING id',
        [syncKind, targetKey],
      );
      return result.rows[0].id;
    });
  }
  async finishSync(id: string, counts: WriteCounts, providerRequests: number, metadata: Record<string, unknown> = {}) {
    await this.database.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now(),records_inserted=$2,records_updated=$3,provider_requests=$4,metadata=$5::jsonb WHERE id=$1`, [id, counts.inserted, counts.updated, providerRequests, JSON.stringify(metadata)]);
  }
  async failSync(id: string, safeMessage: string, providerRequests: number) {
    await this.database.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message=$2,provider_requests=$3 WHERE id=$1`, [id, safeMessage, providerRequests]);
  }

  async listCompetitions(countryCode: 'BR' | 'MX'): Promise<CompetitionReadRecord[]> {
    const result = await this.database.query<{
      competition_name: string;
      competition_slug: string;
      competition_group: string;
      competition_priority: number;
    }>(`SELECT
      CASE WHEN $1='BR' THEN display_name_pt_br ELSE display_name_es_mx END AS competition_name,
      slug AS competition_slug,competition_group,
      CASE WHEN $1='BR' THEN priority_br ELSE priority_mx END AS competition_priority
      FROM competitions
      WHERE enabled AND coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')
      ORDER BY CASE competition_group
        WHEN 'BRAZIL' THEN 1 WHEN 'AMERICAS' THEN 2 WHEN 'EUROPE' THEN 3 WHEN 'OTHER' THEN 4 ELSE 5 END,
        competition_priority,slug`, [countryCode]);
    return result.rows.map(row => ({ competitionName: row.competition_name, competitionSlug: row.competition_slug,
      competitionGroup: row.competition_group, competitionPriority: Number(row.competition_priority) }));
  }

  async listFixtures(countryCode: 'BR' | 'MX', from: Date, to: Date, statuses: readonly string[] = [], competitionSlug?:string): Promise<FixtureReadRecord[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT f.id,f.public_id,f.sport_id,f.competition_id,f.season_id,f.home_team_id,f.away_team_id,
      f.kickoff,f.status,f.home_score,f.away_score,f.created_at,f.updated_at,f.provider_updated_at,
      CASE WHEN $1='BR' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      c.slug AS competition_slug,c.competition_group,
      CASE WHEN $1='BR' THEN c.priority_br ELSE c.priority_mx END AS competition_priority,
      ht.name AS home_team_name,ht.short_name AS home_team_short_name,ht.image_url AS home_team_image_url,
      at.name AS away_team_name,at.short_name AS away_team_short_name,at.image_url AS away_team_image_url
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')
      AND f.kickoff >= $2 AND f.kickoff < $3 AND (cardinality($4::text[]) = 0 OR f.status = ANY($4::text[]))
      AND ($5::text IS NULL OR c.slug=$5)
      ORDER BY competition_priority,f.kickoff,f.id`, [countryCode, from, to, statuses,competitionSlug??null]);
    return result.rows.map(row => ({ fixture: this.fixture(row), publicId: row.public_id ? String(row.public_id) : undefined, competitionName: String(row.competition_name),
      competitionSlug: String(row.competition_slug), competitionGroup: String(row.competition_group),
      competitionPriority: Number(row.competition_priority),
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
