import {describe,expect,it} from 'vitest';
import {catalogNeedsExpansion,mergeCatalogTournaments,resolveCatalogTournaments,schedulerTournaments,selectCanaryTournament, unmatchedCatalogRows} from './tournament-catalog';

const baseline = [
  {tournamentId: 325, tournamentSlug: 'brasileiro-serie-a', categorySlug: 'brazil'},
  {tournamentId: 27464, tournamentSlug: 'liga-mx-apertura', categorySlug: 'mexico'},
  {tournamentId: 17, tournamentSlug: 'premier-league', categorySlug: 'england'},
  {tournamentId: 384, tournamentSlug: 'copa-libertadores', categorySlug: 'international-clubs'},
];

describe('OddsPapi catalog identity', () => {
  it('copies verified provider IDs and never invents them from slugs alone', () => {
    const extra = [...baseline, {tournamentId: 326, tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'}];
    const resolved = resolveCatalogTournaments(extra);
    expect(resolved.find(row => row.canonical === 'brasileirao-serie-b')).toEqual({
      id: '326', slug: 'brasileiro-serie-b', category: 'brazil', canonical: 'brasileirao-serie-b',
    });
    expect(resolveCatalogTournaments([{tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'}])).toEqual([]);
  });

  it('rejects ambiguous slug/category collisions and italy/brazil serie-a mixups', () => {
    expect(resolveCatalogTournaments([...baseline, {tournamentId: 1, tournamentSlug: 'serie-a', categorySlug: 'brazil'}]).some(row => row.canonical === 'serie-a-italy')).toBe(false);
    expect(resolveCatalogTournaments([
      {tournamentId: 8, tournamentSlug: 'serie-a', categorySlug: 'italy'},
      {tournamentId: 9, tournamentSlug: 'serie-a', categorySlug: 'italy'},
    ])).toEqual([]);
    expect(resolveCatalogTournaments([{tournamentId: 8, tournamentSlug: 'serie-a', categorySlug: 'italy'}])[0]).toMatchObject({canonical: 'serie-a-italy', id: '8'});
  });

  it('keeps a single provider ID per canonical competition', () => {
    const resolved = resolveCatalogTournaments([
      ...baseline,
      {tournamentId: 99999, tournamentSlug: 'liga-mx-clausura', categorySlug: 'mexico'},
    ]);
    expect(resolved.filter(row => row.canonical === 'liga-mx')).toEqual([
      {id: '27464', slug: 'liga-mx-apertura', category: 'mexico', canonical: 'liga-mx'},
    ]);
  });

  it('keeps the baseline four when catalog metadata is empty and flags missing upcoming coverage', () => {
    expect(schedulerTournaments([]).map(row => row.id)).toEqual(['325', '27464', '17', '384']);
    expect(catalogNeedsExpansion(baseline, ['brasileirao-serie-a', 'brasileirao-serie-b'])).toBe(true);
    expect(catalogNeedsExpansion(baseline, ['brasileirao-serie-a'])).toBe(false);
  });

  it('schedules every catalog row that resolves to an enabled registry competition (P0 incident: no manual allowlist gate)', () => {
    // A returning competition whose catalog ID differs from the historical allowlist is scheduled from the catalog row itself.
    const extra = [...baseline, {tournamentId: 326, tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'}];
    expect(schedulerTournaments(extra).map(row => row.id)).toEqual(['325', '27464', '17', '384', '326']);
    // The Conference League has an identity rule but never had an allowlisted ID; the catalog row now suffices.
    const uefa = [...baseline,
      {tournamentId: 679, tournamentSlug: 'uefa-europa-league', categorySlug: 'international-clubs'},
      {tournamentId: 9999, tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'},
      {tournamentId: 8888, tournamentSlug: 'not-a-rule', categorySlug: 'moon'},
    ];
    expect(schedulerTournaments(uefa).map(row => [row.id, row.canonical])).toEqual([
      ['325', 'brasileirao-serie-a'], ['27464', 'liga-mx'], ['17', 'premier-league'], ['384', 'copa-libertadores'],
      ['679', 'europa-league'], ['9999', 'conference-league'],
    ]);
    // IDs are copied from catalog rows only: an unruled slug or a non-numeric ID is never scheduled.
    expect(schedulerTournaments([...baseline, {tournamentId: 'abc', tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'}]).map(row => row.id)).toEqual(['325', '27464', '17', '384']);
    // Previously rejected IDs are eligible again (the scheduler isolates and backs them off instead of excluding them forever).
    expect(schedulerTournaments([...baseline, {tournamentId: 19, tournamentSlug: 'fa-cup', categorySlug: 'england'}]).map(row => row.id)).toContain('19');
  });
  it('keeps every well-formed provider row in the stored catalog and surfaces unmatched rows for mapping gaps (P0 incident)', () => {
    const merged = mergeCatalogTournaments(baseline, [
      {tournamentId: 326, tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'},
      {tournamentId: 999, tournamentSlug: 'nba', categorySlug: 'usa', categoryName: 'USA', tournamentName: 'NBA'},
      {tournamentId: 'x', tournamentSlug: 'broken', categorySlug: 'spain'},
    ]);
    expect(merged).toHaveLength(6);
    expect(merged.some(row => (row as {tournamentId: unknown}).tournamentId === 'x')).toBe(false);
    // Never scheduled unless a rule or a registry lookup name resolves it; unmatched rows in registry categories are reported.
    expect(schedulerTournaments(merged).map(row => row.id)).not.toContain('999');
    expect(unmatchedCatalogRows(merged).map(row => row.id)).toContain('999');
  });

  it('resolves an enabled competition without a slug rule from a unique reviewed lookup name in the matching category, copying the provider ID', () => {
    const rows = [...baseline,
      {tournamentId: 4242, tournamentSlug: 'laliga2', categorySlug: 'spain', categoryName: 'Spain', tournamentName: 'LaLiga 2'},
      {tournamentId: 4343, tournamentSlug: 'uefa-conference-league', categorySlug: 'international-clubs', categoryName: 'International Clubs', tournamentName: 'UEFA Conference League'},
      {tournamentId: 4444, tournamentSlug: 'segunda', categorySlug: 'argentina', categoryName: 'Argentina', tournamentName: 'Segunda Division'},
    ];
    const resolved = resolveCatalogTournaments(rows);
    expect(resolved.find(row => row.canonical === 'la-liga-2')).toMatchObject({id: '4242', slug: 'laliga2', category: 'spain'});
    expect(resolved.find(row => row.canonical === 'conference-league')).toMatchObject({id: '4343'});
    // wrong category never matches; two candidates in one category never resolve
    expect(resolved.some(row => row.id === '4444')).toBe(false);
    const twins = [...rows, {tournamentId: 4545, tournamentSlug: 'laliga-2-b', categorySlug: 'spain', categoryName: 'Spain', tournamentName: 'La Liga 2'}];
    expect(resolveCatalogTournaments(twins).some(row => row.canonical === 'la-liga-2')).toBe(false);
    expect(unmatchedCatalogRows(twins).map(row => row.id)).toEqual(expect.arrayContaining(['4242', '4545']));
  });
  it('selects a catalog-verified singleton canary and rejects unknown, stable, rejected, or already-scheduled IDs', () => {
    const catalog = [...baseline,
      {tournamentId: 373, tournamentSlug: 'copa-do-brasil', categorySlug: 'brazil'},
      {tournamentId: 498, tournamentSlug: 'concacaf-champions-cup', categorySlug: 'international-clubs'},
    ];
    // Resolvable enabled competitions are scheduled automatically now, so the manual canary reports them as already scheduled.
    expect(() => selectCanaryTournament('concacaf-champions-cup', catalog)).toThrow('ODDS_TOURNAMENT_ALREADY_SCHEDULED');
    expect(() => selectCanaryTournament('copa-do-brasil', catalog)).toThrow('ODDS_TOURNAMENT_CANARY_REJECTED');
    expect(() => selectCanaryTournament('la-liga-2', catalog)).toThrow('ODDS_TOURNAMENT_UNVERIFIED');
    expect(() => selectCanaryTournament('guessed-league', catalog)).toThrow('ODDS_TOURNAMENT_UNVERIFIED');
    expect(() => selectCanaryTournament('premier-league', catalog)).toThrow('ODDS_TOURNAMENT_ALREADY_STABLE');
    expect(() => selectCanaryTournament('concacaf-champions-cup', catalog, [
      {id: '498', slug: 'concacaf-champions-cup', category: 'international-clubs', canonical: 'concacaf-champions-cup'},
    ])).toThrow('ODDS_TOURNAMENT_ALREADY_SCHEDULED');
  });
});
