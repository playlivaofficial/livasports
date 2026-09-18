import {describe,expect,it} from 'vitest';
import {catalogNeedsExpansion,mergeCatalogTournaments,resolveCatalogTournaments,schedulerTournaments,selectCanaryTournament} from './tournament-catalog';

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
  it('merges only rule-matched football tournaments into the stored catalog', () => {
    const merged = mergeCatalogTournaments(baseline, [
      {tournamentId: 326, tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'},
      {tournamentId: 999, tournamentSlug: 'nba', categorySlug: 'usa'},
    ]);
    expect(merged).toHaveLength(5);
    expect(merged.some(row => (row as {tournamentId: number}).tournamentId === 999)).toBe(false);
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
