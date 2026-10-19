import 'server-only';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateSnapshot, type SportsSnapshot } from './model';
import { WIKIMEDIA_DATASETS } from './wikimedia-datasets';
import { orderSportsSnapshots } from './ordering';

// These are the three retained audit artifacts, not a general-purpose upload directory.
const artifacts = Object.freeze([
  { competitionId: 'liga-mx', filename: 'liga-mx-wikimedia-normalized.json' },
  { competitionId: 'nfl', filename: 'nfl-wikimedia-normalized.json' },
  { competitionId: 'mlb', filename: 'mlb-wikimedia-normalized.json' },
].map(item => Object.freeze(item)));
const maxBytes = 2_000_000;
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

/** Server-only UI flag. Any hosting/database marker disables the unpublished local preview. */
export function localDataPreviewEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
    && process.env.V3_LOCAL_DATA_PREVIEW === 'true'
    && ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'DATABASE_URL', 'DATABASE_POSTGRES_URL', 'POSTGRES_URL'].every(key => process.env[key] === undefined);
}

/** No caller-supplied path, fetching, caching, database writes or publication side effects. */
export async function localPreviewSnapshots(): Promise<SportsSnapshot[]> {
  if (!localDataPreviewEnabled()) return [];
  const directory = resolve(process.cwd(), 'output', 'v3-source-audit');
  try { if (!samePath(await realpath(directory), directory)) return []; } catch { return []; }
  const snapshots: SportsSnapshot[] = [];
  for (const artifact of artifacts) {
    // Recheck before each read; an environment transition must not continue a preview load.
    if (!localDataPreviewEnabled()) return [];
    const filename = join(directory, artifact.filename);
    try {
      const entry = await lstat(filename);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size <= 0 || entry.size > maxBytes || !samePath(await realpath(filename), filename)) continue;
      const file = await open(filename, 'r');
      let raw: string;
      try {
        const opened = await file.stat();
        if (!opened.isFile() || opened.size !== entry.size || opened.size > maxBytes) continue;
        // One bounded read also fails closed if the artifact changes size while being read.
        const bytes = Buffer.alloc(entry.size + 1);
        const read = await file.read(bytes, 0, bytes.length, 0);
        if (read.bytesRead !== entry.size) continue;
        raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, read.bytesRead));
      } finally { await file.close(); }
      const envelope: unknown = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.keys(envelope).some(key => !['snapshot', 'summary'].includes(key))) continue;
      const value = (envelope as { snapshot?: unknown }).snapshot;
      if (validateSnapshot(value).length) continue;
      const snapshot = value as SportsSnapshot, dataset = WIKIMEDIA_DATASETS.find(item => item.competitionId === artifact.competitionId);
      if (!dataset || snapshot.competitionId !== artifact.competitionId || snapshot.sourceId !== 'wikimedia' || snapshot.sourceUrl !== dataset.sourceUrl || snapshot.season !== dataset.season || snapshot.mode === 'automatic') continue;
      snapshots.push(snapshot);
    } catch { /* Missing, unreadable or invalid artifacts are not preview data. */ }
  }
  return localDataPreviewEnabled() ? orderSportsSnapshots(snapshots) : [];
}
