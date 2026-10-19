import { createHash } from 'node:crypto';
import { WIKIMEDIA_DATASETS, type WikimediaDataset } from './wikimedia-datasets';

export const WIKIMEDIA_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const WIKIMEDIA_API = 'https://en.wikipedia.org/w/api.php';
export interface WikimediaPage { title: string; revisionId: number; revisionTimestamp: string; wikitext: string }
export interface WikimediaBatch {
  dataset: Readonly<WikimediaDataset>;
  pages: WikimediaPage[];
  retrievedAt: string;
  sourceSha256: string | null;
}
export interface WikimediaFetchOptions { fetcher?: typeof fetch; now?: Date }

export function getWikimediaDataset(competitionId: string): Readonly<WikimediaDataset> {
  const dataset = WIKIMEDIA_DATASETS.find(item => item.competitionId === competitionId);
  if (!dataset) throw new Error('WIKIMEDIA_DATASET_NOT_APPROVED');
  return dataset;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WIKIMEDIA_RESPONSE_SHAPE');
  return value as Record<string, unknown>;
}

/** Each transcluded table's own revision is retained; article revisions do not date its tables. */
export function normalizeWikimediaBatch(competitionId: string, value: unknown, now = new Date(), sourceSha256: string | null = null): WikimediaBatch {
  const dataset = getWikimediaDataset(competitionId), root = object(value);
  if (root.error) throw new Error('WIKIMEDIA_API_REJECTED');
  const raw = object(root.query).pages;
  if (!Array.isArray(raw) || raw.length !== dataset.titles.length || raw.length > 20) throw new Error('WIKIMEDIA_INCOMPLETE_PAGES');
  const pages = new Map<string, WikimediaPage>();
  for (const item of raw) {
    const page = object(item);
    if (page.missing || page.invalid || page.redirect || typeof page.title !== 'string' || !dataset.titles.includes(page.title) || pages.has(page.title)) throw new Error('WIKIMEDIA_UNEXPECTED_PAGE');
    if (!Array.isArray(page.revisions) || page.revisions.length !== 1) throw new Error('WIKIMEDIA_REVISION_MISSING');
    const revision = object(page.revisions[0]), slot = object(object(revision.slots).main);
    if (!Number.isSafeInteger(revision.revid) || Number(revision.revid) < 1 || typeof revision.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(revision.timestamp)) throw new Error('WIKIMEDIA_INVALID_REVISION');
    const time = Date.parse(revision.timestamp);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== revision.timestamp.slice(0, 19) || time > now.getTime() + 300000) throw new Error('WIKIMEDIA_INVALID_REVISION');
    if (slot.contentmodel !== 'wikitext' || typeof slot.content !== 'string' || !slot.content.trim() || slot.content.length > 300000) throw new Error('WIKIMEDIA_INVALID_CONTENT');
    pages.set(page.title, { title: page.title, revisionId: Number(revision.revid), revisionTimestamp: revision.timestamp, wikitext: slot.content });
  }
  return { dataset, pages: dataset.titles.map(title => pages.get(title)!), retrievedAt: now.toISOString(), sourceSha256 };
}

/** Manual, all-or-nothing preview. One batched official API request, never a request per public page view. */
export async function fetchWikimediaDataset(competitionId: string, options: WikimediaFetchOptions = {}): Promise<WikimediaBatch> {
  const dataset = getWikimediaDataset(competitionId), url = new URL(WIKIMEDIA_API);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', maxlag: '5', titles: dataset.titles.join('|') }).toString();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await (options.fetcher ?? fetch)(url.toString(), { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'LivaSports-DataCollector/3.0 (+https://livasports.com)' } });
    if (!response.ok) throw new Error(response.status === 429 || response.status === 503 ? 'WIKIMEDIA_BACKOFF_REQUIRED' : 'WIKIMEDIA_HTTP_REJECTED');
    if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('WIKIMEDIA_CONTENT_TYPE');
    const maxBytes = 1024 * 1024;
    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error('WIKIMEDIA_TOO_LARGE');
    if (!response.body) throw new Error('WIKIMEDIA_EMPTY');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        length += next.value.byteLength;
        if (length > maxBytes) { await reader.cancel(); throw new Error('WIKIMEDIA_TOO_LARGE'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('WIKIMEDIA_JSON'); }
    return normalizeWikimediaBatch(competitionId, value, options.now ?? new Date(), createHash('sha256').update(bytes).digest('hex'));
  } catch (error) {
    if (error instanceof Error && /^WIKIMEDIA_[A-Z_]+$/.test(error.message)) throw error;
    throw new Error(controller.signal.aborted ? 'WIKIMEDIA_TIMEOUT' : 'WIKIMEDIA_NETWORK');
  } finally { clearTimeout(timer); }
}
