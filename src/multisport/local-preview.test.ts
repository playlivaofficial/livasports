import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';
import type { SportsSnapshot } from './model';
import { WIKIMEDIA_DATASETS } from './wikimedia-datasets';

const io = vi.hoisted(() => ({ files: new Map<string, string>(), escaped: new Set<string>(), symlinks: new Set<string>(), opened: [] as string[], closed: 0 }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (work: unknown) => work }));
vi.mock('@/database/client', () => ({ databaseUrl: () => null, PostgresDatabaseClient: vi.fn(() => { throw new Error('TEST_MUST_NOT_OPEN_DB'); }) }));
vi.mock('node:fs/promises', () => ({
  realpath: vi.fn(async (path: string) => io.escaped.has(path) ? join(path, '..', 'outside') : path),
  lstat: vi.fn(async (path: string) => {
    const contents = io.files.get(path); if (contents === undefined) throw new Error('ENOENT');
    return { isFile: () => true, isSymbolicLink: () => io.symlinks.has(path), size: Buffer.byteLength(contents) };
  }),
  open: vi.fn(async (path: string, mode: string) => {
    expect(mode).toBe('r'); io.opened.push(path);
    const data = Buffer.from(io.files.get(path)!);
    return { stat: async () => ({ isFile: () => true, size: data.length }), read: async (buffer: Buffer) => ({ bytesRead: data.copy(buffer) }), close: async () => { io.closed++; } };
  }),
}));
import { realpath, lstat, open } from 'node:fs/promises';
import { localDataPreviewEnabled, localPreviewSnapshots } from './local-preview';
import { publishedSnapshot, publishedSnapshots } from './server';
import { GET } from '@/app/api/public/sports/snapshots/[competition]/route';

const directory = resolve(process.cwd(), 'output', 'v3-source-audit');
const filepath = (competition: string) => join(directory, `${competition}-wikimedia-normalized.json`);
/** Synthetic TEST fixture for validation only. Never written to the audit directory. */
function fixture(): SportsSnapshot {
  const dataset = WIKIMEDIA_DATASETS.find(item => item.competitionId === 'liga-mx')!;
  return { schemaVersion: 1, competitionId: dataset.competitionId, sport: 'football', season: dataset.season, stage: 'TEST stage', sourceId: 'wikimedia', sourceUrl: dataset.sourceUrl, mode: 'manual', observedAt: '2026-10-18', retrievedAt: '2026-10-19T10:00:00Z', observationBasis: 'data-date', provenance: [{ title: dataset.titles[0], revisionId: 123, revisionTimestamp: '2026-10-19T09:00:00Z', dataAsOf: '2026-10-18' }], entities: [{ id: 'test-a', name: 'Synthetic TEST A', kind: 'club' }, { id: 'test-b', name: 'Synthetic TEST B', kind: 'club' }], tables: [{ type: 'football', id: 'test-table', name: 'TEST table', stage: 'TEST stage', rows: [{ entityId: 'test-a', rank: 1, played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3 }, { entityId: 'test-b', rank: 2, played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 1, goalDifference: -1, points: 0 }] }], events: [] };
}
function retained(value: unknown = fixture()) { io.files.set(filepath('liga-mx'), JSON.stringify({ snapshot: value, summary: { testOnly: true } })); }
beforeEach(() => {
  vi.clearAllMocks(); io.files.clear(); io.escaped.clear(); io.symlinks.clear(); io.opened = []; io.closed = 0;
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('V3_LOCAL_DATA_PREVIEW', 'true');
  for (const key of ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'DATABASE_URL', 'DATABASE_POSTGRES_URL', 'POSTGRES_URL']) vi.stubEnv(key, undefined);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('strict unpublished local source preview gate', () => {
  it('loads only the fixed retained filenames and preserves their original source dates', async () => {
    retained(); io.files.set(join(directory, '../../arbitrary.json'), JSON.stringify({ snapshot: fixture() }));
    expect(localDataPreviewEnabled()).toBe(true);
    const snapshots = await localPreviewSnapshots();
    expect(snapshots).toEqual([fixture()]); expect(snapshots[0].observedAt).toBe('2026-10-18');
    expect(io.opened).toEqual([filepath('liga-mx')]); expect(io.closed).toBe(1);
    expect(vi.mocked(lstat).mock.calls.map(call => call[0])).toEqual(['liga-mx', 'nfl', 'mlb'].map(filepath));
  });
  it.each(['production', 'test', '', 'Development'])('does not access files in NODE_ENV=%s even when explicitly requested', async environment => {
    retained(); vi.stubEnv('NODE_ENV', environment);
    expect(localDataPreviewEnabled()).toBe(false); expect(await localPreviewSnapshots()).toEqual([]);
    expect(realpath).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });
  it.each([undefined, 'false', '1', 'TRUE', 'true '])('requires the exact opt-in value, not %s', async flag => {
    retained(); vi.stubEnv('V3_LOCAL_DATA_PREVIEW', flag);
    expect(await localPreviewSnapshots()).toEqual([]); expect(realpath).not.toHaveBeenCalled();
  });
  it.each(['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'DATABASE_URL', 'DATABASE_POSTGRES_URL', 'POSTGRES_URL'])('blocks when %s is present, including empty or false-like markers', async key => {
    retained();
    for (const value of ['', '0', 'false', 'configured']) {
      vi.stubEnv(key, value); expect(localDataPreviewEnabled()).toBe(false); expect(await localPreviewSnapshots()).toEqual([]);
    }
    expect(realpath).not.toHaveBeenCalled();
  });
  it('returns no data for missing, malformed, oversized or schema-invalid files', async () => {
    expect(await localPreviewSnapshots()).toEqual([]);
    for (const value of ['{bad', 'x'.repeat(2_000_001), JSON.stringify({ snapshot: {} }), JSON.stringify({ snapshot: fixture(), unexpected: true })]) {
      io.files.set(filepath('liga-mx'), value); expect(await localPreviewSnapshots()).toEqual([]);
    }
    const invalid = fixture(); invalid.tables[0].rows[0].rank = 2; retained(invalid);
    expect(await localPreviewSnapshots()).toEqual([]);
  });
  it('rejects symlinks, path escapes and competition data placed under another fixed name', async () => {
    retained(); io.symlinks.add(filepath('liga-mx')); expect(await localPreviewSnapshots()).toEqual([]); expect(open).not.toHaveBeenCalled();
    io.symlinks.clear(); io.escaped.add(filepath('liga-mx')); expect(await localPreviewSnapshots()).toEqual([]); expect(open).not.toHaveBeenCalled();
    io.escaped.clear(); io.escaped.add(directory); expect(await localPreviewSnapshots()).toEqual([]);
    io.escaped.clear(); io.files.set(filepath('nfl'), io.files.get(filepath('liga-mx'))!); io.files.delete(filepath('liga-mx'));
    expect(await localPreviewSnapshots()).toEqual([]);
  });
  it('lets only the development page listing see preview data; the public API stays DB-only', async () => {
    retained(); expect(await publishedSnapshots()).toHaveLength(1);
    vi.clearAllMocks(); io.opened = [];
    expect(await publishedSnapshot('liga-mx')).toBeNull(); expect(open).not.toHaveBeenCalled();
    const response = await GET(new Request('https://livasports.com/api/public/sports/snapshots/liga-mx'), { params: Promise.resolve({ competition: 'liga-mx' }) });
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: 'NOT_FOUND' });
    expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(open).not.toHaveBeenCalled();
  });
});
