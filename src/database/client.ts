import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface QueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}

export interface DatabaseClient extends QueryExecutor {
  transaction<T>(work: (client: QueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DatabaseQueryMetric { event: 'db-query'; operation: string; durationMs: number; }

export class PostgresDatabaseClient implements DatabaseClient {
  private readonly pool: Pool;

  constructor(connectionString: string, private readonly onQuery: (metric: DatabaseQueryMetric) => void = () => undefined) {
    if (!connectionString.trim()) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  }

  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    const started = performance.now();
    try {
      return await this.pool.query<Row>(text, values as unknown[] | undefined);
    } finally {
      this.onQuery({ event: 'db-query', operation: text.trim().split(/\s+/, 1)[0]?.toUpperCase() || 'QUERY',
        durationMs: Math.round((performance.now() - started) * 10) / 10 });
    }
  }

  async transaction<T>(work: (client: QueryExecutor) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> { return this.pool.end(); }
}

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.DATABASE_URL?.trim() || env.DATABASE_POSTGRES_URL?.trim() || env.POSTGRES_URL?.trim();
  if (!value || /user:password@localhost/i.test(value)) return null;
  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get('sslmode');
    if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  } catch {
    return value;
  }
}
