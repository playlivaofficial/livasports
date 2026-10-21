import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EntityIdentity, EventsList, SnapshotSource, SportsNav, StandingsTable } from './components';
import { sportsCopy } from './copy';
import type { SportsSnapshot, SportsTable } from './model';
import { tableLabel } from './table-labels';

/** Synthetic renderer-only TEST fixtures. These are not approved or published snapshots. */
const identity = { id: 'test-table', name: 'Synthetic TEST table', stage: 'TEST stage' };
const testTables: SportsTable[] = [
  { ...identity, type: 'football', rows: [{ entityId: 'test-alpha', rank: 1, played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 4 }] },
  { ...identity, type: 'basketball', conference: 'TEST East', rows: [{ entityId: 'test-alpha', rank: 1, played: 3, wins: 2, losses: 1, winPercentage: 2 / 3, pointsFor: 300, pointsAgainst: 250, gamesBehind: 0.5 }] },
  { ...identity, type: 'baseball', division: 'TEST West', rows: [{ entityId: 'test-alpha', rank: 1, played: 4, wins: 3, losses: 1, winPercentage: 0.75, runsFor: 20, runsAgainst: 10, gamesBehind: 1.5 }] },
  { ...identity, type: 'american-football', conference: 'TEST AFC', rows: [{ entityId: 'test-alpha', rank: 1, played: 4, wins: 2, losses: 1, ties: 1, winPercentage: 0.625, pointsFor: 80, pointsAgainst: 60 }] },
  { ...identity, type: 'ice-hockey', division: 'TEST Atlantic', rows: [{ entityId: 'test-alpha', rank: 1, played: 4, wins: 2, losses: 1, overtimeLosses: 1, points: 5, goalsFor: 10, goalsAgainst: 7 }] },
  { ...identity, type: 'tennis', rankingDate: '2026-10-12', tour: 'ATP', discipline: 'singles', rankingSystem: 'ranking', rows: [{ entityId: 'test-alpha', rank: 1, points: 1200, movement: -3 }] },
  { ...identity, type: 'mma', rankingDate: '2026-10-12', rankingCategory: 'weight-class', weightClass: 'Lightweight', rows: [{ entityId: 'test-alpha', rank: 0, champion: true }, { entityId: 'test-beta', rank: 1 }] },
];
function rendererSnapshot(table: SportsTable = testTables[0]): SportsSnapshot {
  const kind = table.type === 'mma' ? 'fighter' : table.type === 'tennis' ? 'player' : 'club';
  return {
    schemaVersion: 1, competitionId: 'test-renderer-only', sport: table.type, season: '2026/27', stage: 'TEST stage',
    sourceId: 'test-unpublished-source', sourceUrl: 'https://example.invalid/test-only', observedAt: '2026-10-18T12:00:00Z', retrievedAt: '2026-10-19T12:00:00Z', mode: 'manual',
    entities: [{ id: 'test-alpha', name: 'Synthetic Alpha', kind }, { id: 'test-beta', name: 'Synthetic Beta', kind }],
    tables: [structuredClone(table)], events: [],
  };
}
afterEach(() => { vi.restoreAllMocks(); });

describe('server-rendered sport-specific tables using unpublished TEST fixtures', () => {
  it.each(testTables)('offers a compact $type preview without removing source dates or full-page columns',table=>{
    const html=renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" compact limit={5}/>);
    expect(html).toContain('ms-table-preview');expect(html).toContain('Data through');
    expect(html).toContain('Synthetic Alpha');expect(html).not.toContain('ms-table-legend');
    expect(html).not.toContain('>GF<');
  });
  it.each(testTables)('renders $type identities and accessible table structure without remote media', table => {
    const html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" />);
    expect(html).toContain(`ms-table-${table.type}`);
    expect(html).toContain('Synthetic Alpha');
    expect(html).toContain('scope="row"'); expect(html).toContain('scope="col"');
    expect(html).toContain('role="region"'); expect(html).toMatch(/tabindex="0"/i);
    expect(html).not.toMatch(/<img|<iframe|<script|undefined|NaN/);
  });
  it('keeps basketball and baseball percentages and games-behind distinct from football columns', () => {
    for (const index of [1, 2]) {
      const table = testTables[index], html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" />);
      expect(html).toContain('PCT'); expect(html).toContain('GB'); expect(html).not.toContain('>GF<');
      expect(html).toContain(index === 1 ? '0.667' : '0.750');
    }
  });
  it('shows NFL ties and NHL overtime losses and goal difference', () => {
    const nfl = renderToStaticMarkup(<StandingsTable table={testTables[3]} snapshot={rendererSnapshot(testTables[3])} locale="en" />);
    const nhl = renderToStaticMarkup(<StandingsTable table={testTables[4]} snapshot={rendererSnapshot(testTables[4])} locale="en" />);
    expect(nfl).toContain('>T<'); expect(nfl).toContain('0.625');
    expect(nhl).toContain('>OTL<'); expect(nhl).toContain('>GD<'); expect(nhl).toContain('>3</td>');
  });
  it('shows each known optional statistic independently without inventing its missing counterpart', () => {
    const partials: SportsTable[] = [
      { ...identity, type: 'basketball', rows: [{ entityId: 'test-alpha', rank: 1, played: 1, wins: 1, losses: 0, winPercentage: 1, pointsAgainst: 87 }] },
      { ...identity, type: 'baseball', rows: [{ entityId: 'test-alpha', rank: 1, played: 1, wins: 1, losses: 0, winPercentage: 1, gamesBehind: 0, runsAgainst: 3 }] },
      { ...identity, type: 'mma', rankingDate: '2026-10-12', rankingCategory: 'weight-class', weightClass: 'Lightweight', rows: [{ entityId: 'test-alpha', rank: 1, losses: 2, noContests: 1 }] },
    ];
    for (const [index, table] of partials.entries()) {
      const html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en"/>);
      expect(html).toContain(index === 0 ? '>PA</th>' : index === 1 ? '>RA</th>' : '>L</th>');
      expect(html).not.toContain(index === 0 ? '>PF</th>' : index === 1 ? '>RF</th>' : '>W</th>');
      if (index === 2) { expect(html).toContain('>NC</th>'); expect(html).not.toContain('>D</th>'); }
    }
  });
  it('shows tennis ranking date and signed movement without manufacturing tournament seeds', () => {
    const table = testTables[5], html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" />);
    expect(html).toMatch(/datetime="2026-10-12"/i); expect(html).toContain('Change'); expect(html).toContain('>-3</td>');
    expect(html).not.toContain('Seed'); expect(html).not.toContain('>W<');
  });
  it('renders a champion label instead of rank zero and identifies the weight class', () => {
    const table = testTables[6], html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" />);
    expect(html).toMatch(/<td>(?:C|Champion)<\/td>/); expect(html).not.toContain('<td>0</td>');
    expect(html).toContain('Lightweight'); expect(html).toContain('Fighter');
  });
  it.each(['en', 'br', 'mx', 'co', 'pe'] as const)('uses %s locale links and labels', locale => {
    const snapshot = rendererSnapshot(), html = renderToStaticMarkup(<StandingsTable table={snapshot.tables[0]} snapshot={snapshot} locale={locale} />);
    expect(html).toContain(`/${locale}/${locale === 'en' ? 'sports' : locale === 'br' ? 'esportes' : 'deportes'}/football/`);
    expect(html).toContain(sportsCopy(locale).team);
  });
  it('escapes identity text without using names as executable HTML or remote artwork', () => {
    const snapshot = rendererSnapshot(), entity = snapshot.entities[0]; entity.name = '<script>alert("TEST")</script>';
    const html = renderToStaticMarkup(<EntityIdentity entity={entity} snapshot={snapshot} locale="en" />);
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toMatch(/<script|<img/);
  });
});

describe('source precision and event display', () => {
  it.each([
    { status: 'stale', observedAt: '2026-10-01', mode: 'manual', observationBasis: 'data-date' },
    { status: 'historical', observedAt: '2026-09-27T21:47:13Z', mode: 'historical', observationBasis: 'source-revision' },
    { status: 'unconfirmed', observedAt: '2026-10-19T10:00:00Z', mode: 'manual', observationBasis: 'source-revision' },
    { status: 'invalid', observedAt: '2026-10-21T10:00:00Z', mode: 'manual', observationBasis: 'source-revision' },
  ] as const)('places the $status warning and actual source observation before table rows', ({ status, ...fields }) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = Object.assign(rendererSnapshot(), fields), html = renderToStaticMarkup(<StandingsTable table={snapshot.tables[0]} snapshot={snapshot} locale="en"/>);
    expect(html).toContain(`ms-table-freshness-${status}`);
    expect(html.indexOf('ms-table-freshness')).toBeLessThan(html.indexOf('<table'));
    expect(html).toContain(sportsCopy('en')[status === 'invalid' ? 'invalidDate' : status]);
    expect(html).toContain(`dateTime="${snapshot.observedAt}"`);
    expect(html).not.toContain(sportsCopy('en').fresh);
    if (fields.observationBasis === 'source-revision') {
      expect(html).toContain(sportsCopy('en').revisionDate); expect(html).not.toContain('Data through:');
    }
  });
  it.each(['mx', 'co', 'pe', 'br'] as const)('localizes known generated table labels in %s without rewriting source facts', locale => {
    const snapshot = rendererSnapshot(testTables[3]), table = snapshot.tables[0]; table.name = 'AFC East'; table.conference = 'AFC'; table.division = 'East';
    snapshot.entities[0].name = 'East West TEST Club';
    const before = JSON.stringify(snapshot), html = renderToStaticMarkup(<StandingsTable table={table} snapshot={snapshot} locale={locale}/>);
    expect(html).toContain(locale === 'br' ? 'AFC Leste' : 'AFC Este'); expect(html).not.toContain('AFC East');
    expect(html).toContain('East West TEST Club'); expect(JSON.stringify(snapshot)).toBe(before);
    expect(tableLabel('Apertura — community-maintained standings', locale)).not.toContain('community-maintained');
    expect(tableLabel('Regular season — source standings points exclude overtime', locale)).not.toContain('overtime');
    expect(tableLabel('ATP singles rankings — published top 20', locale)).toContain('20');
    expect(tableLabel('Unknown TEST heading', locale)).toBe('Unknown TEST heading');
    expect(tableLabel('AFC East', 'en')).toBe('AFC East');
  });
  it('shows stale data as stale even when the source was checked just now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = rendererSnapshot(); snapshot.competitionId = 'bundesliga'; snapshot.sourceId = 'openligadb'; snapshot.sourceUrl = 'https://api.openligadb.de/getbltable/bl1/2026'; snapshot.observedAt = '2026-10-01T12:00:00Z';
    const html = renderToStaticMarkup(<SnapshotSource snapshot={snapshot} locale="en" />);
    expect(html).toContain('ms-source-stale'); expect(html).toContain(sportsCopy('en').stale);
    expect(html).toMatch(/datetime="2026-10-01T12:00:00Z"/i); expect(html).toMatch(/datetime="2026-10-19T12:00:00Z"/i);
    expect(html).toContain('ODbL-1.0'); expect(html).toContain('https://beta.openligadb.de/lizenz');
    expect(html).toContain('Community-maintained');
  });
  it('preserves a historical source date without inventing a UTC observation time', () => {
    const snapshot = rendererSnapshot(); snapshot.mode = 'historical'; snapshot.observedAt = '2026-09-20';
    const html = renderToStaticMarkup(<SnapshotSource snapshot={snapshot} locale="en" />);
    expect(html).toContain('ms-source-historical'); expect(html).toMatch(/datetime="2026-09-20"/i);
    const observedDateMarkup = /<time datetime="2026-09-20">([^<]*)<\/time>/i.exec(html)?.[1];
    expect(observedDateMarkup).toBeDefined(); expect(observedDateMarkup).not.toMatch(/\d{2}:\d{2}|UTC/);
  });
  it('labels a Wikimedia revision as unconfirmed even when fetched just now, with licence and immutable source links', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = rendererSnapshot(testTables[3]);
    Object.assign(snapshot, { competitionId: 'nfl', sourceId: 'wikimedia', sourceUrl: 'https://en.wikipedia.org/wiki/2026_NFL_season', observationBasis: 'source-revision', observedAt: '2026-10-19T10:00:00Z', provenance: [{ title: 'Template:2026 AFC East standings', revisionId: 123, revisionTimestamp: '2026-10-19T10:00:00Z' }] });
    const html = renderToStaticMarkup(<SnapshotSource snapshot={snapshot} locale="en" />);
    expect(html).toContain('ms-source-unconfirmed'); expect(html).toContain(sportsCopy('en').unconfirmed);
    expect(html).toContain(sportsCopy('en').revisionDate); expect(html).not.toContain('<dt>Data through</dt>');
    expect(html).toContain('CC BY-SA 4.0'); expect(html).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(html).toContain('oldid=123'); expect(html).toContain('Template%3A2026%20AFC%20East%20standings');
    expect(html).toContain('not an official league feed');
  });
  it('preserves a manual ranking data-date rather than replacing it with its newer page revision or fetch', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = rendererSnapshot(testTables[5]);
    Object.assign(snapshot, { competitionId: 'atp-rankings', sourceId: 'wikimedia', sourceUrl: 'https://en.wikipedia.org/wiki/Current_tennis_rankings', observationBasis: 'data-date', observedAt: '2026-10-05', provenance: [{ title: 'Current tennis rankings', revisionId: 123, revisionTimestamp: '2026-10-18T10:00:00Z', dataAsOf: '2026-10-05' }] });
    const html = renderToStaticMarkup(<SnapshotSource snapshot={snapshot} locale="en" />);
    expect(html).toContain('ms-source-stale'); expect(html).toContain('<dt>Data through</dt>');
    expect(html).toMatch(/datetime="2026-10-05"/i); expect(html).not.toContain('2026-10-05T00:00');
    expect(html).not.toContain('ms-source-fresh');
  });
  it('keeps a historical NBA snapshot historical even with a recent review/retrieval', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = rendererSnapshot(testTables[1]);
    Object.assign(snapshot, { competitionId: 'nba', season: '2025/26', mode: 'historical', sourceId: 'wikimedia', sourceUrl: 'https://en.wikipedia.org/wiki/2025%E2%80%9326_NBA_season', observationBasis: 'source-revision', observedAt: '2026-04-18T05:01:00Z', provenance: [{ title: 'TEST historical NBA template', revisionId: 123, revisionTimestamp: '2026-04-18T05:01:00Z' }] });
    const html = renderToStaticMarkup(<SnapshotSource snapshot={snapshot} locale="en" />);
    expect(html).toContain('ms-source-historical'); expect(html).toContain(sportsCopy('en').historical);
    expect(html).toContain(sportsCopy('en').revisionDate); expect(html).toContain('season=2025%2F26');
    expect(html).not.toContain('ms-source-fresh'); expect(html).not.toContain('season=2026%2F27');
  });
  it('keeps the Meta classifier visible and never mislabels weight classes as pound-for-pound', () => {
    const table: SportsTable = { ...identity, type: 'mma', name: "Meta UFC — Women's Strawweight", rankingDate: '2026-10-10', rankingCategory: 'weight-class', rankingSystem: 'meta', weightClass: "Women's Strawweight", rows: [{ entityId: 'test-alpha', rank: 1 }] };
    const html = renderToStaticMarkup(<StandingsTable table={table} snapshot={rendererSnapshot(table)} locale="en" />);
    expect(html).toContain('Meta UFC'); expect(html).toContain('Strawweight'); expect(html).not.toContain('Pound for pound');
  });
  it('renders source-only event dates without a midnight kickoff', () => {
    const snapshot = rendererSnapshot(); snapshot.events = [{ id: 'test-match', stage: 'TEST round', homeId: 'test-alpha', awayId: 'test-beta', start: null, date: '2026-09-20', status: 'completed', scores: { home: 2, away: 1 } }];
    const html = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(html).toMatch(/datetime="2026-09-20"/i); expect(html).not.toContain('00:00'); expect(html).not.toContain(' UTC');
    expect(html).toContain('Synthetic Alpha'); expect(html).toContain('Synthetic Beta');
  });
  it('shows an honest pending date and no fabricated zero score for an unplayed fixture', () => {
    const snapshot = rendererSnapshot(); snapshot.events = [{ id: 'test-match', stage: 'TEST round', homeId: 'test-alpha', awayId: 'test-beta', start: null, status: 'scheduled', scores: null }];
    const html = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(html).toContain(sportsCopy('en').datePending); expect(html).toContain('—'); expect(html).not.toContain('<strong>0</strong>');
    expect(renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" entityId="not-in-this-fixture" />)).toContain(sportsCopy('en').noEvents);
  });
  it('marks a past date-only scheduled fixture as awaiting verification without manufacturing a kickoff', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T12:00:00Z'));
    const snapshot = rendererSnapshot(); snapshot.events = [{ id: 'test-date-only', stage: 'TEST round', homeId: 'test-alpha', awayId: 'test-beta', start: null, date: '2026-10-17', status: 'scheduled', scores: null }];
    const html = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(html).toContain(sportsCopy('en').resultPending); expect(html).not.toContain('00:00');
    snapshot.events[0].date = '2026-10-19';
    const sameDay = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(sameDay).toContain(sportsCopy('en').scheduled); expect(sameDay).not.toContain(sportsCopy('en').resultPending);
  });
  it('shows tennis set detail without deriving seeds', () => {
    const snapshot = rendererSnapshot(testTables[5]); snapshot.events = [{ id: 'test-tennis', stage: 'TEST final', homeId: 'test-alpha', awayId: 'test-beta', start: '2026-10-18T10:00:00Z', status: 'completed', scores: { home: 2, away: 0, periods: [{ label: 'Set 1', home: 6, away: 4 }, { label: 'Set 2', home: 6, away: 3 }] } }];
    const html = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(html).toContain('Set 1'); expect(html).toContain('Set 2'); expect(html).not.toContain('Seed');
  });
  it('renders the winner of a scored-null MMA bout rather than hiding its result', () => {
    const snapshot = rendererSnapshot(testTables[6]); snapshot.events = [{ id: 'test-bout', stage: 'TEST card', homeId: 'test-alpha', awayId: 'test-beta', start: '2026-10-18T10:00:00Z', status: 'completed', scores: null, outcome: 'home-win', method: 'Submission' }];
    const html = renderToStaticMarkup(<EventsList snapshot={snapshot} locale="en" />);
    expect(html).toMatch(/Winner|wins|Home win/i); expect(html).toContain('Submission');
  });
  it('renders the complete sports navigation without a disabled placeholder tab', () => {
    const html = renderToStaticMarkup(<SportsNav locale="en" active="all" />);
    for (const name of ['All sports', 'Football', 'NBA', 'EuroLeague', 'MLB', 'NFL', 'NHL', 'UFC', 'Tennis']) expect(html).toContain(name);
    expect(html).toContain('aria-current="page"'); expect(html).not.toContain('disabled');
  });
});
