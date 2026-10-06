import {describe,expect,it} from 'vitest';
import {catalogNeedsExpansion,mergeCatalogTournaments,resolveCatalogTournaments,schedulerTournaments,selectCanaryTournament, unmatchedCatalogRows} from './tournament-catalog';

const baseline = [
  {tournamentId: 325, tournamentSlug: 'brasileiro-serie-a', categorySlug: 'brazil'},
  {tournamentId: 27464, tournamentSlug: 'liga-mx-apertura', categorySlug: 'mexico'},
  {tournamentId: 17, tournamentSlug: 'premier-league', categorySlug: 'england'},
  {tournamentId: 384, tournamentSlug: 'copa-libertadores', categorySlug: 'international-clubs'},
];

describe('OddsPapi catalog identity', () => {
  it('does not rediscover or schedule retired acquisition targets or the Saudi child',()=>{
    const historical=[{tournamentId:326,tournamentSlug:'brasileiro-serie-b',categorySlug:'brazil'},
      {tournamentId:1678,tournamentSlug:'pro-league-play-offs',categorySlug:'saudi-arabia',tournamentName:'Pro League Play-offs'}];
    expect(resolveCatalogTournaments(historical)).toEqual([]);
    expect(schedulerTournaments([...baseline,...historical]).some(row=>['326','1678'].includes(row.id))).toBe(false);
    expect(catalogNeedsExpansion(baseline,['brasileirao-serie-b','saudi-pro-league-playoffs'])).toBe(false);
  });
  it('copies new CO/PE tournament IDs only from unique approved country/name evidence',()=>{
    const rows=[{tournamentId:61001,tournamentSlug:'sponsor-a',categorySlug:'colombia',tournamentName:'Primera A'},
      {tournamentId:61002,tournamentSlug:'sponsor-b',categorySlug:'peru',tournamentName:'Liga 1'},
      {tournamentId:61003,tournamentSlug:'sponsor-c',categorySlug:'mexico',tournamentName:'Primera A'}];
    expect(resolveCatalogTournaments(rows).map(row=>[row.id,row.canonical])).toEqual([['61001','colombia-primera-a'],['61002','peru-liga-1']]);
    expect(resolveCatalogTournaments([...rows,{...rows[0],tournamentId:61004}]).some(row=>row.canonical==='colombia-primera-a')).toBe(false);
  });
  it('copies verified provider IDs and never invents them from slugs alone', () => {
    const extra = [...baseline, {tournamentId: 9999, tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'}];
    const resolved = resolveCatalogTournaments(extra);
    expect(resolved.find(row => row.canonical === 'conference-league')).toEqual({
      id: '9999', slug: 'uefa-europa-conference-league', category: 'international-clubs', canonical: 'conference-league',
    });
    expect(resolveCatalogTournaments([{tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'}])).toEqual([]);
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
    expect(catalogNeedsExpansion(baseline, ['brasileirao-serie-a', 'conference-league'])).toBe(true);
    expect(catalogNeedsExpansion(baseline, ['brasileirao-serie-a'])).toBe(false);
  });

  it('schedules every catalog row that resolves to an enabled registry competition (P0 incident: no manual allowlist gate)', () => {
    // A returning competition whose catalog ID differs from the historical allowlist is scheduled from the catalog row itself.
    const extra = [...baseline, {tournamentId: 9999, tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'}];
    expect(schedulerTournaments(extra).map(row => row.id)).toEqual(['325', '27464', '17', '384', '9999']);
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
      {tournamentId: 9999, tournamentSlug: 'uefa-europa-conference-league', categorySlug: 'international-clubs'},
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

// Real provider shapes observed in the production catalog on 2026-10-06. OddsPapi splits these
// seasons into Apertura/Clausura containers and keeps the old season-less row at zero fixtures.
const co = {
  legacy: {tournamentId: 241, tournamentSlug: 'primera-a', categorySlug: 'colombia', tournamentName: 'Primera A', futureFixtures: 0, upcomingFixtures: 0},
  apertura: {tournamentId: 27070, tournamentSlug: 'primera-a-apertura', categorySlug: 'colombia', tournamentName: 'Liga DIMAYOR', futureFixtures: 73, upcomingFixtures: 1},
  clausura: {tournamentId: 27072, tournamentSlug: 'primera-a-clausura', categorySlug: 'colombia', tournamentName: 'Primera A, Clausura', futureFixtures: 0, upcomingFixtures: 0},
};
const mx = {
  legacy: {tournamentId: 697, tournamentSlug: 'liga-de-expansion-mx', categorySlug: 'mexico', tournamentName: 'Liga de Expansion MX', futureFixtures: 0, upcomingFixtures: 0},
  apertura: {tournamentId: 27382, tournamentSlug: 'liga-de-expansion-mx-apertura', categorySlug: 'mexico', tournamentName: 'Liga de Expansion MX', futureFixtures: 33, upcomingFixtures: 0},
  clausura: {tournamentId: 27384, tournamentSlug: 'liga-de-expansion-mx-clausura', categorySlug: 'mexico', tournamentName: 'Liga de Expansion MX, Clausura', futureFixtures: 0, upcomingFixtures: 0},
};
const idOf = (rows: unknown[], canonical: string) => resolveCatalogTournaments(rows).find(row => row.canonical === canonical)?.id ?? null;

describe('OddsPapi season containers', () => {
  it('prefers the season container that has fixtures over the empty legacy row', () => {
    // 241 is the row the name fallback used to pick, and it 404s on every refresh.
    expect(idOf([co.legacy, co.apertura, co.clausura], 'colombia-primera-a')).toBe('27070');
    expect(idOf([mx.legacy, mx.apertura, mx.clausura], 'liga-expansion-mx')).toBe('27382');
  });
  it('is order-independent, so the Apertura to Clausura flip needs no code change', () => {
    // Same rows, reversed, and then with the season that carries fixtures swapped over.
    expect(idOf([co.clausura, co.apertura, co.legacy], 'colombia-primera-a')).toBe('27070');
    const flipped = [{...co.apertura, futureFixtures: 0, upcomingFixtures: 0}, {...co.clausura, futureFixtures: 58, upcomingFixtures: 2}];
    expect(idOf(flipped, 'colombia-primera-a')).toBe('27072');
  });
  it('still resolves a single empty container rather than dropping the competition', () => {
    const resolved = resolveCatalogTournaments([co.legacy, co.clausura]);
    const row = resolved.find(r => r.canonical === 'colombia-primera-a');
    // Nothing has fixtures, so the rule match stands and the emptiness is reported, not hidden.
    expect(row?.id).toBe('27072');
    expect(row?.catalogEmpty).toBe(true);
  });
  it('resolves the competitions the BetPlay to DIMAYOR rename left unmatched', () => {
    const rows = [
      {tournamentId: 1238, tournamentSlug: 'primera-b', categorySlug: 'colombia', tournamentName: 'Torneo DIMAYOR', futureFixtures: 34, upcomingFixtures: 2},
      {tournamentId: 1335, tournamentSlug: 'copa-colombia', categorySlug: 'colombia', tournamentName: 'Copa DIMAYOR', futureFixtures: 0, upcomingFixtures: 0},
      {tournamentId: 406, tournamentSlug: 'liga-1', categorySlug: 'peru', tournamentName: 'Liga 1', futureFixtures: 63, upcomingFixtures: 0},
      {tournamentId: 15235, tournamentSlug: 'liga-2', categorySlug: 'peru', tournamentName: 'Liga 2', futureFixtures: 37, upcomingFixtures: 0},
    ];
    expect(resolveCatalogTournaments(rows).map(r => [r.canonical, r.id]).sort()).toEqual([
      ['colombia-primera-b', '1238'], ['copa-colombia', '1335'], ['peru-liga-1', '406'], ['peru-liga-2', '15235'],
    ].sort());
    // The cup is genuinely between seasons; it must be flagged so the scheduler backs off instead of hammering it.
    expect(resolveCatalogTournaments(rows).find(r => r.canonical === 'copa-colombia')?.catalogEmpty).toBe(true);
  });
  it('copies provider IDs and refuses an ambiguous or malformed container', () => {
    // Two rows sharing one slug/category are ambiguous, so neither is used.
    expect(idOf([co.apertura, {...co.apertura, tournamentId: 99999}], 'colombia-primera-a')).toBeNull();
    expect(idOf([{...co.apertura, tournamentId: 'not-a-number'}], 'colombia-primera-a')).toBeNull();
    // A season container in the wrong country is never borrowed.
    expect(idOf([{...co.apertura, categorySlug: 'peru'}], 'colombia-primera-a')).toBeNull();
  });
  it('keeps the empty container out of the scheduler ahead of the live one', () => {
    const ids = schedulerTournaments([co.legacy, co.apertura, co.clausura, mx.legacy, mx.apertura]).map(row => row.id);
    expect(ids).toContain('27070');
    expect(ids).toContain('27382');
    for (const stale of ['241', '27072', '697']) expect(ids).not.toContain(stale);
  });
});
