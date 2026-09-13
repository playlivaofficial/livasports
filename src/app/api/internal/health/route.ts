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
    const commit=process.env.VERCEL_GIT_COMMIT_SHA??process.env.LIVASPORTS_RELEASE_SHA;
    return Response.json({...health,release:{commit:commit&&/^[a-f0-9]{40}$/.test(commit)?commit:null}}, { status: health.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  } finally {
    await database?.close();
  }
}
