import { describe, expect, it, vi } from 'vitest';
import { fetchWikimediaDataset, getWikimediaDataset, normalizeWikimediaBatch } from './wikimedia';

const now = new Date('2026-10-19T12:00:00Z');
function response(competitionId = 'liga-mx') {
  return { query: { pages: getWikimediaDataset(competitionId).titles.map((title, index) => ({ title, revisions: [{ revid: 100 + index, timestamp: '2026-10-18T12:00:00Z', slots: { main: { contentmodel: 'wikitext', content: 'audited table fixture' } } }] })) } };
}

describe('bounded Wikimedia manual transport', () => {
  it('allows only fixed competition datasets and retains each template revision', () => {
    const payload = response('nfl'); payload.query.pages.reverse();
    const batch = normalizeWikimediaBatch('nfl', payload, now);
    expect(batch.pages).toHaveLength(8);
    expect(batch.pages[0].title).toBe('Template:2026 AFC East standings');
    expect(batch.pages[0].revisionTimestamp).toBe('2026-10-18T12:00:00Z');
    expect(() => getWikimediaDataset('https://evil.example')).toThrow('WIKIMEDIA_DATASET_NOT_APPROVED');
  });
  it('rejects partial, duplicate, unexpected, hidden and future pages', () => {
    const partial = response('nfl'); partial.query.pages.pop();
    expect(() => normalizeWikimediaBatch('nfl', partial, now)).toThrow('INCOMPLETE');
    const unexpected = response(); unexpected.query.pages[0].title = 'User:Anything';
    expect(() => normalizeWikimediaBatch('liga-mx', unexpected, now)).toThrow('UNEXPECTED');
    const future = response(); future.query.pages[0].revisions[0].timestamp = '2026-10-20T00:00:00Z';
    expect(() => normalizeWikimediaBatch('liga-mx', future, now)).toThrow('INVALID_REVISION');
    const hidden = response(); hidden.query.pages[0].revisions[0].slots.main.content = '';
    expect(() => normalizeWikimediaBatch('liga-mx', hidden, now)).toThrow('INVALID_CONTENT');
    expect(() => normalizeWikimediaBatch('liga-mx', { error: { code: 'maxlag' } }, now)).toThrow('API_REJECTED');
  });
  it('makes one bounded batch request with a contact User-Agent, no redirects and no automatic retries', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response('nfl')), { headers: { 'content-type': 'application/json; charset=utf-8' } }));
    const batch = await fetchWikimediaDataset('nfl', { fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(batch.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).origin).toBe('https://en.wikipedia.org');
    expect(new URL(url).searchParams.get('maxlag')).toBe('5');
    expect(new URL(url).searchParams.get('titles')?.split('|')).toHaveLength(8);
    expect(options.redirect).toBe('error');
    expect((options.headers as Record<string, string>)['User-Agent']).toContain('LivaSports');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('fails closed for rate limits, non-JSON, oversized and credential-bearing network errors', async () => {
    for (const response of [new Response('', { status: 429 }), new Response('<html>', { headers: { 'content-type': 'text/html' } }), new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1048577' } })]) {
      const fetcher = vi.fn(async () => response);
      await expect(fetchWikimediaDataset('liga-mx', { fetcher, now })).rejects.toThrow(/^WIKIMEDIA_/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    await expect(fetchWikimediaDataset('liga-mx', { fetcher: async () => { throw new Error('secret connection URL'); }, now })).rejects.toThrow('WIKIMEDIA_NETWORK');
    const fetcher = vi.fn();
    await expect(fetchWikimediaDataset('unapproved', { fetcher, now })).rejects.toThrow('NOT_APPROVED');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
