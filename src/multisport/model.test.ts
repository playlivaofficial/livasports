import { describe, expect, it } from 'vitest';
import { SNAPSHOT_LIMITS, snapshotFreshness, validateSnapshot, type SportsSnapshot, type SportsTable } from './model';
import { getSportsSource, isApprovedSourceForCompetition, isApprovedSourceUrl, SPORTS_SOURCES } from './sources';

const NOW = new Date('2026-10-19T12:00:00Z');
/** Entirely synthetic TEST data. This fixture is never exported to production. */
function testSnapshot(): SportsSnapshot {
  return {
    schemaVersion: 1, competitionId: 'bundesliga', sport: 'football', season: '2026/27', stage: 'regular-season',
    sourceId: 'openligadb', sourceUrl: 'https://api.openligadb.de/getbltable/bl1/2026',
    observedAt: '2026-10-18T18:00:00Z', retrievedAt: '2026-10-19T10:00:00Z', mode: 'manual',
    entities: [{ id: 'test-alpha', name: 'Synthetic Alpha Club', kind: 'club' }, { id: 'test-beta', name: 'Synthetic Beta Club', kind: 'club' }],
    tables: [{ type: 'football', id: 'overall', name: 'Test table', stage: 'regular-season', rows: [
      { entityId: 'test-alpha', rank: 1, played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 3 },
      { entityId: 'test-beta', rank: 2, played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, goalDifference: -1, points: 0 },
    ] }],
    events: [{ id: 'test-event', stage: 'regular-season', round: '1', homeId: 'test-alpha', awayId: 'test-beta', start: '2026-10-18T14:00:00Z', status: 'completed', scores: { home: 2, away: 1 } }],
  };
}
function invalid(mutate: (snapshot: SportsSnapshot) => void, expected?: string) {
  const snapshot = testSnapshot(); mutate(snapshot);
  const errors = validateSnapshot(snapshot, NOW);
  expect(errors.length).toBeGreaterThan(0);
  if (expected) expect(errors.join('\n')).toContain(expected);
}

describe('strict bounded snapshots', () => {
  it('accepts a fully specified synthetic fixture in every permitted ingestion mode', () => {
    for (const mode of ['automatic', 'manual', 'historical'] as const) {
      const value = testSnapshot(); value.mode = mode; expect(validateSnapshot(value, NOW)).toEqual([]);
    }
  });
  it.each([null, [], {}, 1, 'snapshot', false, undefined, NaN, Infinity])('rejects non-snapshots %s', value => {
    expect(validateSnapshot(value, NOW).length).toBeGreaterThan(0);
  });
  it('rejects unknown fields at every nested boundary, including logo URLs', () => {
    const targets = [(s: SportsSnapshot) => s, (s: SportsSnapshot) => s.entities[0], (s: SportsSnapshot) => s.tables[0], (s: SportsSnapshot) => s.tables[0].rows[0], (s: SportsSnapshot) => s.events[0], (s: SportsSnapshot) => s.events[0].scores!];
    for (const target of targets) invalid(s => { Object.assign(target(s), { logoUrl: 'https://example.com/logo.png' }); }, 'unknown field');
  });
  it('rejects missing required values, invalid versions, and unknown sport/mode', () => {
    for (const key of ['schemaVersion', 'competitionId', 'sport', 'season', 'stage', 'sourceId', 'sourceUrl', 'observedAt', 'retrievedAt', 'mode', 'entities', 'tables', 'events']) {
      const value = testSnapshot() as unknown as Record<string, unknown>; delete value[key]; expect(validateSnapshot(value, NOW).length).toBeGreaterThan(0);
    }
    invalid(s => Object.assign(s, { schemaVersion: 2 }), 'version');
    invalid(s => Object.assign(s, { sport: 'cricket' }), 'sport');
    invalid(s => Object.assign(s, { mode: 'approved-manual' }), 'mode');
  });
  it('rejects sparse arrays, cycles, accessors, unusual prototypes and unsafe keys without executing accessors', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(validateSnapshot(cycle, NOW)[0]).toContain('cycle');
    const getter = Object.defineProperty({}, 'entities', { enumerable: true, get() { throw new Error('must not run'); } });
    expect(validateSnapshot(getter, NOW)[0]).toContain('accessor');
    expect(validateSnapshot(new Date(), NOW)[0]).toContain('non-plain');
    expect(validateSnapshot(JSON.parse('{"__proto__":{}}'), NOW)[0]).toContain('unsafe key');
    invalid(s => { s.entities = Array(2); }, 'sparse');
    invalid(s => { Object.assign(s.events, { unexpected: true }); }, 'extended array');
  });
  it('enforces count, text, numeric and error budgets', () => {
    invalid(s => { s.entities = Array.from({ length: SNAPSHOT_LIMITS.entities + 1 }, (_, i) => ({ id: `test-${i}`, name: `Synthetic Club ${i}`, kind: 'club' })); }, 'entities');
    invalid(s => { s.events = Array.from({ length: SNAPSHOT_LIMITS.events + 1 }, (_, i) => ({ ...s.events[0], id: `test-event-${i}`, scores: null })); }, 'limits');
    invalid(s => { s.entities[0].name = 'a'.repeat(161); }, 'characters');
    invalid(s => { s.entities[0].id = '../path'; }, 'identifier');
    invalid(s => { s.tables[0].rows[0].rank = 1.5; }, 'integer');
    invalid(s => { s.tables[0].rows[0].rank = Number.MAX_SAFE_INTEGER; }, 'rank');
    const value = testSnapshot(); value.entities = Array.from({ length: 200 }, (_, index) => ({ id: `test-${index}`, name: '', kind: 'club' }));
    expect(validateSnapshot(value, NOW)).toHaveLength(SNAPSHOT_LIMITS.errors);
  });
  it('allows the real Bundesliga volume without fake production teams or fixture assumptions', () => {
    const value = testSnapshot(); value.entities = Array.from({ length: 18 }, (_, i) => ({ id: `test-club-${i}`, name: `Synthetic Club ${i}`, kind: 'club' }));
    value.tables = [{ type: 'football', id: 'test-table', name: 'Synthetic table', stage: 'regular-season', rows: value.entities.map((entity, i) => ({ entityId: entity.id, rank: i + 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })) }];
    value.events = value.entities.flatMap(home => value.entities.filter(away => away.id !== home.id).map(away => ({ id: `${home.id}-${away.id}`, stage: 'regular-season', homeId: home.id, awayId: away.id, start: null, status: 'scheduled' as const, scores: null })));
    expect(value.events).toHaveLength(306); expect(validateSnapshot(value, NOW)).toEqual([]);
  });
});

describe('identity, arithmetic and temporal integrity', () => {
  it('rejects duplicate or absent entities, fixtures, table IDs/ranks/participants', () => {
    invalid(s => { s.entities.push({ ...s.entities[0] }); }, 'duplicate entity');
    invalid(s => { s.entities[0].name = 'TBD'; }, 'placeholder');
    invalid(s => { s.tables[0].rows[0].entityId = 'missing'; }, 'unknown entity');
    invalid(s => { s.tables[0].rows[1].rank = 1; }, 'duplicate rank');
    invalid(s => { s.tables[0].rows[1].entityId = 'test-alpha'; }, 'duplicate table participant');
    invalid(s => { s.tables.push(structuredClone(s.tables[0])); }, 'duplicate table');
    invalid(s => { s.events[0].awayId = s.events[0].homeId; }, 'different');
    invalid(s => { s.events[0].awayId = 'missing'; }, 'unknown entity');
    invalid(s => { s.events.push(structuredClone(s.events[0])); }, 'duplicate event');
    invalid(s => { s.events.push({ ...structuredClone(s.events[0]), id: 'other-event' }); }, 'duplicate fixture');
    invalid(s => { s.events = []; s.tables = []; }, 'requires a table or event');
  });
  it('validates football arithmetic including explicit deductions without inventing a scoring adjustment', () => {
    invalid(s => { if (s.tables[0].type === 'football') s.tables[0].rows[0].played = 9; }, 'arithmetic');
    invalid(s => { if (s.tables[0].type === 'football') s.tables[0].rows[0].goalDifference = 9; }, 'arithmetic');
    invalid(s => { if (s.tables[0].type === 'football') s.tables[0].rows[0].points = 9; }, 'arithmetic');
    const value = testSnapshot(); if (value.tables[0].type === 'football') Object.assign(value.tables[0].rows[0], { points: -3, pointsAdjustment: -6 });
    expect(validateSnapshot(value, NOW)).toEqual([]);
  });
  it('validates UTC source/retrieval order and rejects impossible dates', () => {
    invalid(s => { s.observedAt = '2026-10-20T00:00:00Z'; }, 'future');
    invalid(s => { s.observedAt = '2026-10-19T11:00:00Z'; }, 'follow retrieval');
    invalid(s => { s.retrievedAt = '2026-10-20T00:00:00Z'; }, 'future');
    invalid(s => { s.observedAt = '2026-02-30T00:00:00Z'; }, 'valid UTC');
    invalid(s => { s.observedAt = '2026-10-18'; }, 'valid UTC');
    invalid(s => { s.observedAt = '2026-10-18T12:00:00+02:00'; }, 'valid UTC');
    expect(validateSnapshot(testSnapshot(), new Date('invalid'))).toEqual(['now: invalid clock']);
  });
  it('does not refresh source age when a stale snapshot was just retrieved', () => {
    const value = testSnapshot(); value.observedAt = '2026-10-01T12:00:00Z'; value.retrievedAt = NOW.toISOString();
    expect(snapshotFreshness(value, NOW)).toEqual({ status: 'stale', ageHours: 432, observedAt: value.observedAt });
    expect(snapshotFreshness({ ...value, mode: 'historical' }, NOW).status).toBe('historical');
    expect(snapshotFreshness(testSnapshot(), NOW).status).toBe('fresh');
    expect(snapshotFreshness({ ...value, observedAt: 'bad' }, NOW).status).toBe('invalid');
    expect(snapshotFreshness(value, NOW, 0).status).toBe('invalid');
  });
  it('does not manufacture scores or future results', () => {
    invalid(s => { s.events[0].status = 'scheduled'; }, 'unplayed');
    invalid(s => { s.events[0].scores = null; }, 'require scores');
    invalid(s => { s.events[0].start = null; }, 'need a start');
    invalid(s => { s.events[0].start = '2026-10-21T00:00:00Z'; }, 'source observation');
    invalid(s => { s.events[0].outcome = 'away-win'; }, 'contradicts');
    invalid(s => { s.events[0].scores!.home = -1; }, 'scores.home');
    invalid(s => { s.events[0].method = 'KO'; }, 'only valid for MMA');
    invalid(s => { s.events[0].scores!.periods = [{ label: '1', home: 1, away: 0 }, { label: '1', home: 1, away: 1 }]; }, 'duplicate period');
  });
  it('accepts a source calendar date without inventing a midnight kickoff or timezone', () => {
    const value = testSnapshot(); value.events[0].start = null; value.events[0].date = '2026-10-18';
    expect(validateSnapshot(value, NOW)).toEqual([]); expect(value.events[0].start).toBeNull();
    value.events[0].date = '2026-02-30'; expect(validateSnapshot(value, NOW).join('\n')).toContain('valid calendar date');
    value.events[0].date = '2026-10-21'; expect(validateSnapshot(value, NOW).join('\n')).toContain('source observation');
    value.events[0].date = '2026-10-17'; value.events[0].start = '2026-10-18T14:00:00Z';
    expect(validateSnapshot(value, NOW).join('\n')).toContain('contradicts');
  });
  it('preserves date-only observation precision for historical sources and never treats it as a current timestamp', () => {
    const value = testSnapshot(); value.mode = 'historical'; value.observedAt = '2026-10-18'; value.events[0].start = null; value.events[0].date = '2026-10-18';
    expect(validateSnapshot(value, NOW)).toEqual([]);
    expect(snapshotFreshness(value, NOW)).toEqual({ status: 'historical', observedAt: '2026-10-18', ageHours: 50 });
    value.events[0].start = '2026-10-18T14:00:00Z'; expect(validateSnapshot(value, NOW)).toEqual([]);
    value.mode = 'automatic'; expect(validateSnapshot(value, NOW).join('\n')).toContain('valid UTC');
    value.mode = 'manual'; expect(snapshotFreshness(value, NOW).status).toBe('invalid');
    value.mode = 'historical'; value.observedAt = '2026-02-30'; expect(validateSnapshot(value, NOW).length).toBeGreaterThan(0);
  });
});

describe('sport-specific schemas are ready but are not source licences', () => {
  const identity = { id: 'test-table', name: 'Synthetic sport table', stage: 'regular-season', group: 'Test group', conference: 'Test conference', division: 'Test division' };
  const variants: SportsTable[] = [
    { ...identity, type: 'basketball', rows: [{ entityId: 'test-alpha', rank: 1, played: 3, wins: 2, losses: 1, winPercentage: 0.667, pointsFor: 300, pointsAgainst: 290, gamesBehind: 0.5 }] },
    { ...identity, type: 'baseball', rows: [{ entityId: 'test-alpha', rank: 1, played: 3, wins: 2, losses: 1, winPercentage: 0.667, runsFor: 12, runsAgainst: 10, gamesBehind: 0 }] },
    { ...identity, type: 'american-football', rows: [{ entityId: 'test-alpha', rank: 1, played: 4, wins: 2, losses: 1, ties: 1, winPercentage: 0.625, pointsFor: 100, pointsAgainst: 80 }] },
    { ...identity, type: 'ice-hockey', rows: [{ entityId: 'test-alpha', rank: 1, played: 4, wins: 2, losses: 1, overtimeLosses: 1, points: 5, goalsFor: 10, goalsAgainst: 8, regulationWins: 1 }] },
    { ...identity, type: 'tennis', rankingDate: '2026-10-18', tour: 'ATP', discipline: 'singles', rankingSystem: 'ranking', rows: [{ entityId: 'test-alpha', rank: 1, points: 1000, tournamentsPlayed: 12 }] },
    { ...identity, type: 'mma', rankingDate: '2026-10-18', rankingCategory: 'weight-class', weightClass: 'Lightweight', rows: [{ entityId: 'test-alpha', rank: 0, champion: true, wins: 10, losses: 1, draws: 0, noContests: 0 }] },
  ];
  const competitionForSport = { basketball: 'nba', baseball: 'mlb', 'american-football': 'nfl', 'ice-hockey': 'nhl', tennis: 'atp-rankings', mma: 'ufc', football: 'bundesliga' };
  it.each(variants)('accepts the $type shape but rejects using a football licence for it', table => {
    const value = testSnapshot(); value.sport = table.type; value.tables = [structuredClone(table)]; value.events = [];
    value.competitionId = competitionForSport[table.type];
    value.entities.forEach(entity => { entity.kind = table.type === 'mma' ? 'fighter' : table.type === 'tennis' ? 'player' : 'club'; });
    expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']);
  });
  it('keeps tennis draw seeds separate from rankings and validates dates and per-draw uniqueness', () => {
    const value = testSnapshot(); value.sport = 'tennis'; value.competitionId = 'atp-rankings'; value.tables = [structuredClone(variants[4])]; value.events = []; value.entities.forEach(e => { e.kind = 'player'; });
    value.seeds = [{ entityId: 'test-beta', seed: 1, draw: 'Test singles draw', announcedAt: '2026-10-17T00:00:00Z' }];
    expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']);
    value.seeds.push({ ...value.seeds[0] }); expect(validateSnapshot(value, NOW).join('\n')).toContain('duplicate seed');
    value.seeds[0].announcedAt = '2026-10-21T00:00:00Z'; expect(validateSnapshot(value, NOW).join('\n')).toContain('postdate');
    if (value.tables[0].type === 'tennis') value.tables[0].rankingDate = '2026-02-30';
    expect(validateSnapshot(value, NOW).join('\n')).toContain('calendar date');
  });
  it('checks percentage, NHL overtime accounting and sport-specific unknown fields', () => {
    const value = testSnapshot(); value.sport = 'basketball'; value.events = []; value.tables = [structuredClone(variants[0])];
    if (value.tables[0].type === 'basketball') value.tables[0].rows[0].winPercentage = 0.5;
    expect(validateSnapshot(value, NOW).join('\n')).toContain('inconsistent win percentage');
    value.sport = 'ice-hockey'; value.tables = [structuredClone(variants[3])];
    if (value.tables[0].type === 'ice-hockey') value.tables[0].rows[0].points = 4;
    expect(validateSnapshot(value, NOW).join('\n')).toContain('arithmetic');
    Object.assign(value.tables[0].rows[0], { drawn: 1 }); expect(validateSnapshot(value, NOW).join('\n')).toContain('unknown field');
  });
  it('keeps champions separate from MMA contenders and requires an actual bout outcome', () => {
    const value = testSnapshot(); value.sport = 'mma'; value.competitionId = 'ufc'; value.tables = [structuredClone(variants[5])]; value.entities.forEach(e => { e.kind = 'fighter'; });
    value.events[0].scores = null; value.events[0].outcome = 'home-win'; value.events[0].method = 'Submission';
    expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']);
    delete value.events[0].outcome; expect(validateSnapshot(value, NOW).join('\n')).toContain('require a result');
    value.tables[0].rows[0].rank = 1; expect(validateSnapshot(value, NOW).join('\n')).toContain('champion uses rank 0');
  });
  it('validates completed period arithmetic and tennis sets rather than summing games as sets', () => {
    const value = testSnapshot(); value.events[0].scores!.periods = [{ label: 'First half', home: 1, away: 0 }, { label: 'Second half', home: 1, away: 1 }];
    expect(validateSnapshot(value, NOW)).toEqual([]);
    value.events[0].scores!.periods[1].home = 2;
    expect(validateSnapshot(value, NOW).join('\n')).toContain('period totals');
    value.sport = 'tennis'; value.competitionId = 'atp-rankings'; value.tables = [structuredClone(variants[4])]; value.entities.forEach(e => { e.kind = 'player'; });
    value.events[0].scores = { home: 2, away: 1, periods: [{ label: 'Set 1', home: 4, away: 6 }, { label: 'Set 2', home: 6, away: 4 }, { label: 'Set 3', home: 6, away: 2 }] };
    expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']);
    value.events[0].scores.home = 3; expect(validateSnapshot(value, NOW).join('\n')).toContain('period totals');
  });
  it('permits only signed integer tennis movement and never infers a seed from it', () => {
    const value = testSnapshot(); value.sport = 'tennis'; value.competitionId = 'atp-rankings'; value.tables = [structuredClone(variants[4])]; value.events = []; value.entities.forEach(e => { e.kind = 'player'; });
    const table = value.tables[0]; if (table.type !== 'tennis') throw new Error('Test table mismatch');
    for (const movement of [-12, 0, 8]) { table.rows[0].movement = movement; expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']); }
    expect(value.seeds).toBeUndefined();
    for (const movement of [0.5, -10001, 10001, Infinity]) { table.rows[0].movement = movement; expect(validateSnapshot(value, NOW).some(error => error.includes('movement') || error.includes('non-finite'))).toBe(true); }
  });
  it('does not misclassify pound-for-pound as a weight class or championship', () => {
    const value = testSnapshot(); value.sport = 'mma'; value.competitionId = 'ufc'; value.tables = [structuredClone(variants[5])]; value.events = []; value.entities.forEach(e => { e.kind = 'fighter'; });
    Object.assign(value.tables[0], { weightClass: 'Pound-for-pound' });
    expect(validateSnapshot(value, NOW).join('\n')).toContain('actual weight class');
    Object.assign(value.tables[0], { rankingCategory: 'pound-for-pound' });
    expect(validateSnapshot(value, NOW).join('\n')).toContain('do not have a weight class');
    if (value.tables[0].type === 'mma') {
      value.tables[0] = { ...identity, type: 'mma', rankingDate: '2026-10-18', rankingCategory: 'pound-for-pound', rows: [{ entityId: 'test-alpha', rank: 1 }] };
    }
    expect(validateSnapshot(value, NOW)).toEqual(['sourceId: source is not approved for this sport']);
  });
});

describe('explicit factual-data approval registry', () => {
  it('approves only the three reviewed factual sources, without image permissions', () => {
    expect(Object.values(SPORTS_SOURCES).filter(source => source.status === 'approved').map(source => source.id).sort()).toEqual(['openfootball', 'openligadb', 'wikimedia']);
    expect(Object.values(SPORTS_SOURCES).every(source => source.logoRights === 'not-granted')).toBe(true);
    expect(getSportsSource('openligadb')?.licenseId).toBe('ODbL-1.0');
    expect(getSportsSource('openfootball')?.licenseId).toBe('CC0-1.0');
    expect(getSportsSource('constructor')).toBeUndefined();
  });
  it.each(['manual', 'automatic', 'historical'] as const)('does not let %s mode bypass pending or arbitrary source approval', mode => {
    for (const sourceId of ['nba', 'manual-approved', 'owner', 'unknown', '__proto__']) invalid(s => { s.mode = mode; s.sourceId = sourceId; }, 'licence');
  });
  it('matches exact secure hosts and scoped OpenFootball repositories', () => {
    expect(isApprovedSourceUrl('openligadb', 'https://api.openligadb.de/getbltable/bl1/2026')).toBe(true);
    expect(isApprovedSourceUrl('openfootball', 'https://raw.githubusercontent.com/openfootball/football.json/master/test.json')).toBe(true);
    for (const url of ['http://api.openligadb.de/data', 'https://api.openligadb.de.evil.example/data', 'https://openligadb.org/data', 'https://user:pass@api.openligadb.de/data', 'https://api.openligadb.de:8443/data', 'https://api.openligadb.de/data#secret']) expect(isApprovedSourceUrl('openligadb', url)).toBe(false);
    expect(isApprovedSourceUrl('openfootball', 'https://github.com/someone/football')).toBe(false);
    expect(isApprovedSourceUrl('nba', 'https://www.nba.com')).toBe(false);
  });
  it('binds catalog competitions to their sport and specifically approved datasets', () => {
    invalid(s => { s.competitionId = 'fake-competition'; }, 'approved catalog');
    invalid(s => { s.competitionId = 'nba'; }, 'sport does not match');
    invalid(s => { s.competitionId = 'premier-league'; }, 'not approved for this competition');
    invalid(s => { s.sourceUrl = 'https://api.openligadb.de/getbltable/bl2/2026'; }, 'not approved for this competition');
    invalid(s => { s.sourceUrl = 'https://www.openligadb.de'; }, 'not approved for this competition');
    invalid(s => { s.sourceUrl = 'https://api.openligadb.de/getbltable/bl1/2025'; }, 'competition and season');
    invalid(s => { s.season = '2026-27'; }, 'competition and season');
    invalid(s => { s.season = '2026'; }, 'competition and season');
    const value = testSnapshot(); value.sourceId = 'openfootball'; value.competitionId = 'premier-league'; value.sourceUrl = 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json'; value.mode = 'historical'; value.tables = []; value.observedAt = '2026-09-20'; value.events[0].start = null; value.events[0].date = '2026-09-20';
    expect(validateSnapshot(value, NOW)).toEqual([]);
    value.sourceUrl = 'https://github.com/openfootball/football.json/blob/master/2026-27/en.1.json';
    expect(validateSnapshot(value, NOW)).toEqual([]);
    value.sourceUrl = 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/es.1.json';
    expect(validateSnapshot(value, NOW).join('\n')).toContain('not approved for this competition');
    value.sourceUrl = 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json'; value.season = '2027/28';
    expect(validateSnapshot(value, NOW).join('\n')).toContain('competition and season');
    expect(isApprovedSourceForCompetition('openfootball', 'liga-mx', 'football', 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json')).toBe(false);
    expect(isApprovedSourceForCompetition('openfootball', 'euro', 'football', 'https://raw.githubusercontent.com/openfootball/euro.json/master/2028/euro.json')).toBe(false);
  });
  it('requires historical mode for a catalog archive rather than presenting an old edition as current', () => {
    const value = testSnapshot(); value.sourceId = 'openfootball'; value.competitionId = 'euro-2024-archive'; value.season = '2024'; value.sourceUrl = 'https://raw.githubusercontent.com/openfootball/euro.json/master/2024/euro.json'; value.tables = []; value.observedAt = '2024-07-14T22:00:00Z'; value.events[0].start = '2024-07-14T19:00:00Z';
    expect(validateSnapshot(value, NOW).join('\n')).toContain('requires historical mode');
    value.mode = 'historical'; expect(validateSnapshot(value, NOW)).toEqual([]);
  });
  it('does not let Owner-authored OpenFootball snapshots exceed verified source capabilities', () => {
    const value = testSnapshot(); value.sourceId = 'openfootball'; value.competitionId = 'premier-league'; value.sourceUrl = 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json';
    const errors = validateSnapshot(value, NOW).join('\n');
    expect(errors).toContain('approved only for historical results'); expect(errors).toContain('no approved standings'); expect(errors).toContain('verified only through 2026-09-20'); expect(errors).toContain('audit cutoff');
    value.mode = 'historical'; value.tables = []; value.observedAt = '2026-09-20'; value.events[0].start = null; value.events[0].date = '2026-09-20'; value.events[0].status = 'scheduled'; value.events[0].scores = null;
    expect(validateSnapshot(value, NOW).join('\n')).toContain('only for completed historical results');
    value.events[0].status = 'completed'; value.events[0].scores = { home: 2, away: 1 }; expect(validateSnapshot(value, NOW)).toEqual([]);
  });
});
