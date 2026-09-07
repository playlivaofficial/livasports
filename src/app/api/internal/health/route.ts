import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { loadProviderEnvironment } from '@/config/server';
import { HealthService } from '@/health/HealthService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connectionString = databaseUrl();
  const database = connectionString ? new PostgresDatabaseClient(connectionString) : null;
  const providers = loadProviderEnvironment();
  try {
    const health = await new HealthService(database).check({ sportmonks: Boolean(providers.sportmonksApiKey), oddsPapi: Boolean(providers.oddsPapiApiKey) });
    return Response.json(health, { status: health.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  } finally {
    await database?.close();
  }
}
