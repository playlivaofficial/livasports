import { describe, expect, it } from 'vitest';
import { CORE_GEOS, competitionDemand } from './geo';
import { APPROVED_COMPETITION_TARGETS, CANONICAL_COMPETITION_TARGETS, NEW_GEO_COMPETITION_TARGETS, isAcquisitionCompetition, targetsForGeo } from './footballCompetitions';

describe('verified MX/CO/PE football inventory', () => {
  it('retains 41 canonical identities but acquires only 32 standalone competitions', () => {
    expect(CANONICAL_COMPETITION_TARGETS).toHaveLength(41);
    expect(new Set(CANONICAL_COMPETITION_TARGETS.map(row => row.slug)).size).toBe(41);
    expect(new Set(CANONICAL_COMPETITION_TARGETS.map(row => row.key)).size).toBe(41);
    expect(APPROVED_COMPETITION_TARGETS).toHaveLength(33);
    expect(APPROVED_COMPETITION_TARGETS.filter(row => isAcquisitionCompetition(row.slug))).toHaveLength(32);
    expect(APPROVED_COMPETITION_TARGETS.every(row => Number.isSafeInteger(row.sportmonksId))).toBe(true);
    expect(new Set(APPROVED_COMPETITION_TARGETS.map(row => row.sportmonksId)).size).toBe(33);
  });

  it('keeps Saudi playoffs as an ingestible child, never a second acquisition league', () => {
    expect(APPROVED_COMPETITION_TARGETS.find(row => row.slug === 'saudi-pro-league-playoffs'))
      .toMatchObject({ sportmonksId: 1678, parentSlug: 'saudi-pro-league', automatic: true, enabled: true });
    expect(isAcquisitionCompetition('saudi-pro-league')).toBe(true);
    expect(isAcquisitionCompetition('saudi-pro-league-playoffs')).toBe(false);
    for (const geo of CORE_GEOS) expect(targetsForGeo(geo).some(row => row.parentSlug)).toBe(false);
  });

  it('preserves old indexed competition identities without promoting them', () => {
    const historical = ['ligue-2', 'serie-b-italy', 'super-lig', 'brasileirao-serie-b', 'paulista-a1', 'carioca-serie-a', 'copa-do-nordeste', 'uefa-super-cup'];
    expect(CANONICAL_COMPETITION_TARGETS.filter(row => !row.approvedInventory).map(row => row.slug).sort()).toEqual(historical.sort());
    for (const slug of historical) {
      expect(CANONICAL_COMPETITION_TARGETS.find(row => row.slug === slug)?.enabled).toBe(true);
      expect(isAcquisitionCompetition(slug)).toBe(false);
    }
  });

  it('binds all seven additions to verified IDs and canonical local countries', () => {
    expect(NEW_GEO_COMPETITION_TARGETS.map(row => [row.slug, row.sportmonksId, row.countryCode])).toEqual([
      ['liga-expansion-mx', 749, 'MX'], ['leagues-cup', 3211, null],
      ['colombia-primera-a', 672, 'CO'], ['copa-colombia', 681, 'CO'], ['colombia-primera-b', 678, 'CO'],
      ['peru-liga-1', 764, 'PE'], ['peru-liga-2', 767, 'PE'],
    ]);
  });

  it('uses only central GEO demand seeds, with stable ties, not a competing SEO order', () => {
    for (const geo of CORE_GEOS) {
      const rows = targetsForGeo(geo);
      expect(rows).toHaveLength(32);
      expect(rows.every(row => row.geoRelevance.includes(geo))).toBe(true);
      expect(rows).toEqual([...rows].sort((a, b) => competitionDemand(geo, b.slug) - competitionDemand(geo, a.slug) || a.slug.localeCompare(b.slug)));
    }
    expect(competitionDemand('CO', 'colombia-primera-a')).toBeGreaterThan(competitionDemand('MX', 'colombia-primera-a'));
    expect(competitionDemand('PE', 'peru-liga-1')).toBeGreaterThan(competitionDemand('CO', 'peru-liga-1'));
  });
});
