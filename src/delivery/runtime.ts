import 'server-only';
import type { PageKey, SiteLocale } from '@/config/i18n';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { PostgresFootballRepository } from '@/repositories/postgres-football.repository';
import { DatabaseM2ReadService, emptyDatabasePage } from './DatabaseM2ReadService';

let runtime: DatabaseM2ReadService | null = null;

function getRuntime(): DatabaseM2ReadService | null {
  if (runtime) return runtime;
  const connectionString = databaseUrl();
  if (!connectionString) return null;
  runtime = new DatabaseM2ReadService(new PostgresFootballRepository(new PostgresDatabaseClient(connectionString)));
  return runtime;
}

export function loadM2PageData(locale: SiteLocale, page: PageKey) {
  return getRuntime()?.load(locale, page) ?? Promise.resolve(emptyDatabasePage(locale, page));
}
