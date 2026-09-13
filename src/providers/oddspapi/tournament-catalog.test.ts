import {describe,expect,it} from 'vitest';
import {catalogNeedsExpansion,mergeCatalogTournaments,resolveCatalogTournaments,schedulerTournaments} from './tournament-catalog';

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

  it('merges only rule-matched football tournaments into the stored catalog', () => {
    const merged = mergeCatalogTournaments(baseline, [
      {tournamentId: 326, tournamentSlug: 'brasileiro-serie-b', categorySlug: 'brazil'},
      {tournamentId: 999, tournamentSlug: 'nba', categorySlug: 'usa'},
    ]);
    expect(merged).toHaveLength(5);
    expect(merged.some(row => (row as {tournamentId: number}).tournamentId === 999)).toBe(false);
  });
});
