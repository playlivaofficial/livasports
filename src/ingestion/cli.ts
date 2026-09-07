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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const command = process.argv[2] ?? 'football';
const selectedTargetKeys = new Set((process.argv[3] ?? '').split(',').map(value => value.trim()).filter(Boolean));
const targets = selectedTargetKeys.size ? FOOTBALL_COMPETITION_TARGETS.filter(target => selectedTargetKeys.has(target.key)) : FOOTBALL_COMPETITION_TARGETS;
if (selectedTargetKeys.size && targets.length !== selectedTargetKeys.size) throw new Error('One or more requested competition target keys are unknown');
const connectionString = databaseUrl();
if (!connectionString) throw new Error('DATABASE_URL (or the supported Neon server-side fallback) is required');
const database = new PostgresDatabaseClient(connectionString);

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
    const migrations = await runMigrations(database);
    console.info(JSON.stringify({ command, migrationsApplied: migrations }));
  } else if (command === 'read') {
    const repository = new PostgresFootballRepository(database);
    const service = new DatabaseM2ReadService(repository);
    const pages = await Promise.all((['br', 'mx'] as const).map(async locale => {
      const data = await service.load(locale, 'football');
      return { locale, state: data.sportsData.state, competitions: data.competitions.length,
        fixtures: data.sections.reduce((sum, section) => sum + section.fixtures.length, 0), paidOddsRequests: data.paidOddsRequests };
    }));
    console.info(JSON.stringify({ command, pages }));
  } else {
    const gateway = new HttpSportmonksGateway(required('SPORTMONKS_API_KEY'), process.env.SPORTMONKS_BASE_URL);
    const mappings = new ProviderMappingService(new PostgresProviderEntityMappingRepository(database));
    const service = new FootballIngestionService(new SportmonksAdapter(gateway, mappings), new PostgresFootballRepository(database), targets);
    const result = command === 'fixtures' ? await service.syncFixtures()
      : command === 'scores' ? await service.syncFixtureScores()
        : await service.syncFootball();
    console.info(JSON.stringify({ command, result }));
  }
} catch (error) {
  console.error(JSON.stringify({ command, status: 'FAILED', ...safeCliError(error) }));
  process.exitCode = 1;
} finally {
  await database.close();
}
