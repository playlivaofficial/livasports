/** Bounded manual source audit. No database, secrets, scheduled jobs or publication. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchWikimediaDataset, getWikimediaDataset, type WikimediaBatch } from '../src/multisport/wikimedia';
import { normalizeWikimediaMultisport } from '../src/multisport/wikimedia-multisport';
import { normalizeWikimediaSports } from '../src/multisport/wikimedia-football';
import { snapshotFreshness } from '../src/multisport/model';
import { normalizeWikimediaNba } from '../src/multisport/wikimedia-nba';

const ids = [...new Set(process.argv.slice(2))];
if (!ids.length || ids.length > 8) throw new Error('Choose one to eight approved competition IDs.');
ids.forEach(getWikimediaDataset);
const now = new Date(), directory = join('output', 'v3-source-audit', now.toISOString().replaceAll(':', '-'));
await mkdir(directory, { recursive: true });
const fetched = new Map<string, WikimediaBatch>();
let requests = 0;
for (const id of ids) {
  const dataset = getWikimediaDataset(id), key = dataset.titles.join('|');
  let batch: WikimediaBatch;
  try {
    if (!fetched.has(key)) { requests++; fetched.set(key, await fetchWikimediaDataset(id, { now })); }
    batch = { ...fetched.get(key)!, dataset };
  } catch (error) {
    // Transport failures stop the entire run; no retries or storm against a failing host.
    console.log(JSON.stringify({ id, requests, status: 'STOPPED', error: error instanceof Error ? error.message : 'SOURCE_ERROR' }));
    process.exitCode = 1; break;
  }
  await writeFile(join(directory, `${id}-source.json`), JSON.stringify(batch, null, 2));
  try {
    const result = id==='nba'?{snapshot:normalizeWikimediaNba(batch,now)}:['liga-mx', 'colombia-primera-a', 'nfl', 'mlb'].includes(id) ? normalizeWikimediaSports(batch, now) : normalizeWikimediaMultisport(batch, now);
    await writeFile(join(directory, `${id}-normalized.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ id, requests, status: 'PARSED_NOT_FACT_CHECKED', freshness: snapshotFreshness(result.snapshot, now), entities: result.snapshot.entities.length, tables: result.snapshot.tables.length, rows: result.snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0), evidence: directory }));
  } catch (error) {
    console.log(JSON.stringify({ id, requests, status: 'REJECTED', error: error instanceof Error ? error.message : 'NORMALIZATION_ERROR', evidence: directory }));
  }
}
