import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { runMigrations } from '@/database/migrate';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { FootballIngestionService } from '@/ingestion/FootballIngestionService';
import { HttpSportmonksGateway } from '@/providers/sportmonks/HttpSportmonksGateway';
import { SportmonksAdapter } from '@/providers/sportmonks/SportmonksAdapter';
import { SafeProviderError, sanitizeText } from '@/providers/safe-error';
import { PostgresFootballRepository } from '@/repositories/postgres-football.repository';
import { PostgresProviderEntityMappingRepository } from '@/repositories/postgres-provider-mapping.repository';
import { FOOTBALL_COMPETITION_TARGETS } from '@/config/footballCompetitions';
import { DatabaseM2ReadService } from '@/delivery/DatabaseM2ReadService';
import { CompetitionCoverageService } from '@/competition/CompetitionCoverageService';
import { isIngestibleCoverage } from '@/competition/coverage';
import { coverageReportData, writeCoverageReports } from '@/competition/report';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const command = process.argv[2] ?? 'football';
const selectedTargetKeys = new Set((process.argv[3] ?? '').split(',').map(value => value.trim()).filter(Boolean));
const targets = selectedTargetKeys.size ? FOOTBALL_COMPETITION_TARGETS.filter(target => selectedTargetKeys.has(target.key)) : FOOTBALL_COMPETITION_TARGETS;
if (selectedTargetKeys.size && targets.length !== selectedTargetKeys.size) throw new Error('One or more requested competition target keys are unknown');
let database: PostgresDatabaseClient | undefined;

function requiredDatabase(): PostgresDatabaseClient {
  if (database) return database;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error('DATABASE_URL (or the supported Neon server-side fallback) is required');
  database = new PostgresDatabaseClient(connectionString);
  return database;
}

function safeCliError(error: unknown): { code: string | null; message: string } {
  if (error instanceof SafeProviderError) return { code: error.context.code, message: error.message };
  const value = error as { code?: unknown; message?: unknown };
  const secrets = [process.env.DATABASE_URL, process.env.DATABASE_POSTGRES_URL, process.env.DATABASE_POSTGRES_PASSWORD,
    process.env.DATABASE_PGPASSWORD, process.env.SPORTMONKS_API_KEY].filter((item): item is string => Boolean(item));
  const raw = typeof value.message === 'string' ? value.message : 'M2 command failed';
  const message = sanitizeText(raw, secrets).replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_DATABASE_URL]');
  return { code: typeof value.code === 'string' ? value.code : null, message };
}

try {
  if (command === 'migrate') {
    const migrations = await runMigrations(requiredDatabase());
    console.info(JSON.stringify({ command, migrationsApplied: migrations }));
  } else if (command === 'read') {
    const repository = new PostgresFootballRepository(requiredDatabase());
    const service = new DatabaseM2ReadService(repository);
    const pages = await Promise.all((['br', 'mx'] as const).map(async locale => {
      const data = await service.load(locale, 'football');
      return { locale, state: data.sportsData.state, competitions: data.competitions.length,
        fixtures: data.sections.reduce((sum, section) => sum + section.fixtures.length, 0), paidOddsRequests: data.paidOddsRequests };
    }));
    console.info(JSON.stringify({ command, pages }));
  } else if (command === 'stats') {
    const db = requiredDatabase();
    const totals = await db.query<{ competitions: string; seasons: string; current_seasons: string; teams: string; fixtures: string; mappings: string }>(`SELECT
      (SELECT count(*) FROM competitions WHERE enabled)::text AS competitions,
      (SELECT count(*) FROM seasons)::text AS seasons,
      (SELECT count(*) FROM seasons WHERE is_current)::text AS current_seasons,
      (SELECT count(*) FROM teams)::text AS teams,
      (SELECT count(*) FROM fixtures)::text AS fixtures,
      (SELECT count(*) FROM provider_entity_mappings)::text AS mappings`);
    const byCompetition = await db.query<{ slug: string; name: string; seasons: string; current_seasons: string; teams: string; fixtures: string; coverage_status: string }>(`SELECT
      c.slug,c.canonical_name AS name,c.coverage_status,
      count(DISTINCT s.id)::text AS seasons,
      count(DISTINCT s.id) FILTER (WHERE s.is_current)::text AS current_seasons,
      count(DISTINCT ts.team_id)::text AS teams,count(DISTINCT f.id)::text AS fixtures
      FROM competitions c LEFT JOIN seasons s ON s.competition_id=c.id LEFT JOIN team_seasons ts ON ts.season_id=s.id
      LEFT JOIN fixtures f ON f.competition_id=c.id WHERE c.enabled GROUP BY c.id ORDER BY c.priority_br,c.slug`);
    const latestRuns = await db.query<{ sync_kind: string; status: string; records_inserted: number; records_updated: number; provider_requests: number; metadata: Record<string, unknown> }>(
      `SELECT DISTINCT ON (sync_kind) sync_kind,status,records_inserted,records_updated,provider_requests,metadata
       FROM ingestion_sync_runs ORDER BY sync_kind,started_at DESC`,
    );
    console.info(JSON.stringify({ command, totals: totals.rows[0], byCompetition: byCompetition.rows, latestRuns: latestRuns.rows }));
  } else {
    const gateway = new HttpSportmonksGateway(required('SPORTMONKS_API_KEY'), process.env.SPORTMONKS_BASE_URL);
    if (command === 'coverage' || command === 'expand') {
      const validation = await new CompetitionCoverageService(gateway).validate(targets);
      const report = command === 'expand' && selectedTargetKeys.size
        ? coverageReportData(validation)
        : await writeCoverageReports(validation);
      if (command === 'coverage') {
        console.info(JSON.stringify({ command, configuredCompetitions: report.configuredCompetitions,
          summary: report.summary, requestsConsumed: validation.requestsConsumed }));
      } else {
        const ingestible = validation.results.filter(result => isIngestibleCoverage(result.classification)).map(result => result.target);
        const db = requiredDatabase();
        const mappings = new ProviderMappingService(new PostgresProviderEntityMappingRepository(db));
        const service = new FootballIngestionService(new SportmonksAdapter(gateway, mappings), new PostgresFootballRepository(db), ingestible);
        const result = await service.syncFootball();
        console.info(JSON.stringify({ command, coverage: report.summary, coverageRequests: validation.requestsConsumed,
          ingestibleCompetitions: ingestible.length, result }));
      }
    } else {
      const db = requiredDatabase();
      const mappings = new ProviderMappingService(new PostgresProviderEntityMappingRepository(db));
      const service = new FootballIngestionService(new SportmonksAdapter(gateway, mappings), new PostgresFootballRepository(db), targets);
      const result = command === 'fixtures' ? await service.syncFixtures()
        : command === 'scores' ? await service.syncFixtureScores()
          : await service.syncFootball();
      console.info(JSON.stringify({ command, result }));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ command, status: 'FAILED', ...safeCliError(error) }));
  process.exitCode = 1;
} finally {
  await database?.close();
}
