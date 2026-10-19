import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import type { SportsSnapshot } from './model';

const state = vi.hoisted(() => ({ snapshots: [] as SportsSnapshot[], preview: false }));
vi.mock('./server', () => ({ publishedSnapshots: async () => state.snapshots }));
vi.mock('./local-preview', () => ({ localDataPreviewEnabled: () => state.preview }));
vi.mock('@/editorial/server', () => ({ publishedNews: async () => [] }));
vi.mock('@/v2/pages', () => ({ V2Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/editorial/NewsCards', () => ({ NewsCard: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('TEST_NOT_FOUND'); } }));
import { CompetitionPage, EntityPage, SportsDirectory, resolveSportsRoute } from './pages';
import { StandingsHighlights } from './HomeModules';

/** Renderer-only synthetic fixtures, never source data or publication inputs. */
function nbaSnapshot(season: string, mode: 'manual' | 'historical', name: string, observedAt: string): SportsSnapshot {
  return { schemaVersion: 1, competitionId: 'nba', sport: 'basketball', season, stage: 'TEST regular season', sourceId: 'wikimedia', sourceUrl: 'https://en.wikipedia.org/wiki/2025%E2%80%9326_NBA_season', mode, observationBasis: 'source-revision', observedAt, retrievedAt: '2026-10-19T12:00:00Z', provenance: [{ title: 'TEST NBA source', revisionId: 123, revisionTimestamp: observedAt }], entities: [{ id: name, name, kind: 'club' }], tables: [{ type: 'basketball', id: 'test', name: 'TEST East', stage: 'TEST stage', conference: 'East', rows: [{ entityId: name, rank: 1, played: 82, wins: 60, losses: 22, winPercentage: 60 / 82, gamesBehind: 0 }] }], events: [] };
}

beforeEach(() => { state.snapshots = []; state.preview = false; });
describe('competition page publication boundaries', () => {
  it('hides unpublished preview downloads on directory, competition, entity and home views without hiding attribution', async () => {
    state.preview = true;
    const snapshot = nbaSnapshot('2026/27', 'manual', 'TEST-preview', new Date().toISOString());
    // Renderer-only: a fresh explicit source date lets the home highlight be exercised.
    snapshot.observationBasis = 'data-date';
    state.snapshots = [snapshot];
    for (const page of [
      await SportsDirectory({ locale: 'en', sport: 'basketball' }),
      await CompetitionPage({ locale: 'en', competitionId: 'nba' }),
      await EntityPage({ locale: 'en', competitionId: 'nba', entityId: 'TEST-preview' }),
      await StandingsHighlights({ locale: 'en' }),
    ]) {
      const $ = load(renderToStaticMarkup(page));
      expect($('.ms-source')).toHaveLength(1);
      expect($('.ms-source a[download]')).toHaveLength(0);
      expect($('a[href^="/api/public/sports/snapshots/"]')).toHaveLength(0);
      expect($('.ms-source a[rel^="license"]').attr('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
      expect($('.ms-source details a').attr('href')).toContain('oldid=123');
      expect($('.ms-source-links a').first().attr('href')).toBe(snapshot.sourceUrl);
    }
  });
  it('retains the download action for published database views', async () => {
    state.snapshots = [nbaSnapshot('2025/26', 'historical', 'TEST-published', '2026-04-18T05:01:00Z')];
    const $ = load(renderToStaticMarkup(await CompetitionPage({ locale: 'en', competitionId: 'nba' })));
    expect($('.ms-source a[download]').attr('href')).toBe('/api/public/sports/snapshots/nba?season=2025%2F26');
  });
  it.each(['en', 'br', 'mx', 'co', 'pe'] as const)('does not invent NBA tables or player identities when no snapshot is published in %s', async locale => {
    // Resolve the async data loader first; the rendered tree contains synchronous test shell/components.
    const html = renderToStaticMarkup(await CompetitionPage({ locale, competitionId: 'nba' })), $ = load(html);
    expect($('h1').text()).toBe('National Basketball Association');
    expect($('.ms-unavailable')).toHaveLength(1);
    expect($('.ms-table')).toHaveLength(0); expect($('.ms-entity')).toHaveLength(0);
    expect($('.ms-season-picker')).toHaveLength(0); expect($('script[type="application/ld+json"]')).toHaveLength(0);
    expect($('.ms-unavailable a').attr('href')).toContain('nba.com');
    expect(html).not.toContain('Synthetic'); expect(html).not.toContain('<strong>0</strong>');
  });
  it('does not let an unrequested or nonexistent archive masquerade as a published season', async () => {
    await expect(CompetitionPage({ locale: 'en', competitionId: 'nba', season: '2025-26' })).rejects.toThrow('TEST_NOT_FOUND');
  });
  it('labels an available historical NBA edition as historical instead of the upcoming catalog season', async () => {
    state.snapshots = [nbaSnapshot('2025/26', 'historical', 'TEST-old', '2026-04-18T05:01:00Z')];
    const $ = load(renderToStaticMarkup(await CompetitionPage({ locale: 'en', competitionId: 'nba' })));
    expect($('.ms-competition-heading').text()).toContain('2025/26');
    expect($('.ms-competition-heading .ms-status').text()).toBe('Historical snapshot');
    expect($('.ms-competition-heading').text()).not.toContain('Upcoming');
    expect($('.ms-source').hasClass('ms-source-historical')).toBe(true);
    expect($('.ms-table th').toArray().map(node => $(node).text())).not.toContain('PF');
    expect($('.ms-table th').toArray().map(node => $(node).text())).not.toContain('PA');
  });
  it('prefers the current edition over a historical snapshot with a newer revision', async () => {
    state.snapshots = [nbaSnapshot('2025/26', 'historical', 'TEST-old', '2026-10-19T10:00:00Z'), nbaSnapshot('2026/27', 'manual', 'TEST-current', '2026-10-18T10:00:00Z')];
    const $ = load(renderToStaticMarkup(await CompetitionPage({ locale: 'en', competitionId: 'nba' })));
    expect($('.ms-competition-heading').text()).toContain('2026/27');
    expect($('.ms-table').text()).toContain('TEST-current'); expect($('.ms-table').text()).not.toContain('TEST-old');
  });
  it('never describes a revision timestamp as result temporal coverage in Dataset metadata', async () => {
    state.snapshots = [nbaSnapshot('2025/26', 'historical', 'TEST-old', '2026-04-18T05:01:00Z')];
    const $ = load(renderToStaticMarkup(await CompetitionPage({ locale: 'en', competitionId: 'nba', season: '2025-26' })));
    const dataset = JSON.parse($('script[type="application/ld+json"]').text());
    expect(dataset.temporalCoverage).toBeUndefined();
    expect(dataset.description).toContain('Source revision (not result cutoff)');
    expect(dataset.url).toBe('https://livasports.com/en/sports/basketball/nba/season/2025-26');
  });
  it('keeps historical entity links and records attached to their selected season', async () => {
    state.snapshots = [nbaSnapshot('2025/26', 'historical', 'TEST-old', '2026-04-18T05:01:00Z'), nbaSnapshot('2026/27', 'manual', 'TEST-current', '2026-10-18T10:00:00Z')];
    const archivedPage = load(renderToStaticMarkup(await CompetitionPage({ locale: 'en', competitionId: 'nba', season: '2025-26' })));
    expect(archivedPage('.ms-entity').first().attr('href')).toBe('/en/sports/basketball/nba/season/2025-26/entities/TEST-old');
    expect(resolveSportsRoute(['basketball', 'nba', 'season', '2025-26', 'entities', 'TEST-old'])).toMatchObject({ kind: 'entity', season: '2025-26', entityId: 'TEST-old' });
    const entityPage = load(renderToStaticMarkup(await EntityPage({ locale: 'en', competitionId: 'nba', season: '2025-26', entityId: 'TEST-old' })));
    expect(entityPage('h1').text()).toBe('TEST-old');
    expect(entityPage('.v2-breadcrumb a').attr('href')).toBe('/en/sports/basketball/nba/season/2025-26');
    await expect(EntityPage({ locale: 'en', competitionId: 'nba', entityId: 'TEST-old' })).rejects.toThrow('TEST_NOT_FOUND');
  });
});
