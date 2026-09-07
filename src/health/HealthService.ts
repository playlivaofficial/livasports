import type { DatabaseClient } from '@/database/client';

export interface InternalHealth {
  status: 'ok' | 'degraded';
  database: 'available' | 'unavailable';
  cache: 'available';
  lastFootballSync: string | null;
  lastScoreSync: string | null;
  lastFootballSyncAgeSeconds: number | null;
  lastScoreSyncAgeSeconds: number | null;
  providerConfigured: { sportmonks: boolean; oddsPapi: boolean };
}

export class HealthService {
  constructor(private readonly database: DatabaseClient | null) {}

  async check(providerConfigured: InternalHealth['providerConfigured']): Promise<InternalHealth> {
    if (!this.database) return { status: 'degraded', database: 'unavailable', cache: 'available',
      lastFootballSync: null, lastScoreSync: null, lastFootballSyncAgeSeconds: null, lastScoreSyncAgeSeconds: null, providerConfigured };
    try {
      const result = await this.database.query<{ last_football_sync: Date | null; last_score_sync: Date | null }>(`SELECT
        (SELECT max(completed_at) FROM ingestion_sync_runs WHERE sync_kind='FIXTURES' AND status='SUCCEEDED') AS last_football_sync,
        (SELECT max(completed_at) FROM ingestion_sync_runs WHERE sync_kind='SCORES' AND status='SUCCEEDED') AS last_score_sync`);
      const row = result.rows[0];
      const football = row.last_football_sync ? new Date(row.last_football_sync) : null;
      const scores = row.last_score_sync ? new Date(row.last_score_sync) : null;
      return { status: 'ok', database: 'available', cache: 'available',
        lastFootballSync: football?.toISOString() ?? null, lastScoreSync: scores?.toISOString() ?? null,
        lastFootballSyncAgeSeconds: football ? Math.max(0, Math.round((Date.now() - football.getTime()) / 1000)) : null,
        lastScoreSyncAgeSeconds: scores ? Math.max(0, Math.round((Date.now() - scores.getTime()) / 1000)) : null,
        providerConfigured };
    } catch {
      return { status: 'degraded', database: 'unavailable', cache: 'available',
        lastFootballSync: null, lastScoreSync: null, lastFootballSyncAgeSeconds: null, lastScoreSyncAgeSeconds: null, providerConfigured };
    }
  }
}
