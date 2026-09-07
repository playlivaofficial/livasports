import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { DatabaseClient } from './client';

export async function runMigrations(database: DatabaseClient, directory = resolve(fileURLToPath(new URL('../../db/migrations', import.meta.url)))): Promise<string[]> {
  const files = (await readdir(directory)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = await database.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const known = new Set(applied.rows.map(row => row.filename));
  const executed: string[] = [];
  for (const filename of files) {
    if (known.has(filename)) continue;
    const sql = await readFile(resolve(directory, filename), 'utf8');
    await database.query(sql);
    await database.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    executed.push(filename);
  }
  return executed;
}
