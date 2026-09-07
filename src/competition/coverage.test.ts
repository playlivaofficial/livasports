import { describe, expect, it } from 'vitest';
import { FOOTBALL_COMPETITION_TARGETS, targetsForGeo } from '@/config/footballCompetitions';
import { CompetitionCoverageStatus, CompetitionType, TeamType } from '@/domain/enums';
import type { SportmonksLeaguePayload, SportmonksSeasonPayload } from '@/providers/sportmonks/types';
import { applyFixtureAvailability, classifyAccessibleCoverage, classifyMissingAccess, selectRelevantSeasons } from './coverage';

function league(id: number, name: string, countryName: string, iso2: string, seasons: SportmonksSeasonPayload[] = []): SportmonksLeaguePayload {
  return { id, sport_id: 1, country_id: id + 1000, name, country: { id: id + 1000, name: countryName, iso2 }, seasons };
}

describe('M3.6 competition registry', () => {
  it('contains exactly the approved 34 unique canonical targets', () => {
    expect(FOOTBALL_COMPETITION_TARGETS).toHaveLength(34);
    expect(new Set(FOOTBALL_COMPETITION_TARGETS.map(target => target.slug)).size).toBe(34);
    expect(new Set(FOOTBALL_COMPETITION_TARGETS.map(target => target.key)).size).toBe(34);
  });

  it('uses only supported competition types and deterministic GEO priorities', () => {
    const types = new Set(Object.values(CompetitionType));
    expect(FOOTBALL_COMPETITION_TARGETS.every(target => types.has(target.type))).toBe(true);
    expect(targetsForGeo('BR')[0].slug).toBe('brasileirao-serie-a');
    expect(targetsForGeo('MX')[0].slug).toBe('liga-mx');
    expect(new Set(FOOTBALL_COMPETITION_TARGETS.map(target => target.priority.br)).size).toBe(34);
    expect(new Set(FOOTBALL_COMPETITION_TARGETS.map(target => target.priority.mx)).size).toBe(34);
  });

  it('excludes the deferred international package and keeps this registry club-only', () => {
    expect(FOOTBALL_COMPETITION_TARGETS.every(target => target.teamType === TeamType.CLUB)).toBe(true);
    const deferred = ['world-cup', 'copa-america', 'conmebol-world-cup-qualifiers', 'uefa-euro',
      'concacaf-gold-cup', 'concacaf-world-cup-qualifiers', 'uefa-nations-league'];
    expect(FOOTBALL_COMPETITION_TARGETS.some(target => deferred.includes(target.slug))).toBe(false);
    expect(FOOTBALL_COMPETITION_TARGETS.find(target => target.slug === 'saudi-pro-league-playoffs')?.automatic).toBe(true);
  });
});

describe('M3.6 Sportmonks coverage classification', () => {
  it('rejects ambiguous same-confidence provider matches', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'premier-league')!;
    const [result] = classifyAccessibleCoverage([target], [league(1, 'Premier League', 'England', 'GB'), league(2, 'Premier League', 'England', 'GB')]);
    expect(result.classification).toBe(CompetitionCoverageStatus.AMBIGUOUS_MAPPING);
    expect(result.providerCompetition).toBeNull();
  });

  it('does not accept an unsupported country homonym', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'serie-a-italy')!;
    const [result] = classifyAccessibleCoverage([target], [league(325, 'Serie A', 'Brazil', 'BR')]);
    expect(result.classification).toBe(CompetitionCoverageStatus.NOT_FOUND);
  });

  it('classifies a discoverable but inaccessible competition without fabricating support', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'liga-mx')!;
    const [missing] = classifyAccessibleCoverage([target], []);
    const result = classifyMissingAccess(missing, [league(99, 'Liga MX', 'Mexico', 'MX')]);
    expect(result.classification).toBe(CompetitionCoverageStatus.NO_SUBSCRIPTION_ACCESS);
    expect(result.providerCompetition?.id).toBe(99);
  });

  it('classifies checked supported competitions by fixture availability', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'bundesliga')!;
    const [supported] = classifyAccessibleCoverage([target], [league(82, 'Bundesliga', 'Germany', 'DE')]);
    expect(applyFixtureAvailability(supported, new Map([[82, 4]])).classification).toBe(CompetitionCoverageStatus.SUPPORTED);
    expect(applyFixtureAvailability(supported, new Map()).classification).toBe(CompetitionCoverageStatus.SUPPORTED_BUT_NO_CURRENT_FIXTURES);
  });

  it('supports split seasons without forcing a calendar-year model', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'liga-mx')!;
    const seasons: SportmonksSeasonPayload[] = [
      { id: 1, league_id: 99, name: '2026/2027 Apertura', is_current: true },
      { id: 2, league_id: 99, name: '2026/2027 Clausura', is_current: true },
      { id: 3, league_id: 99, name: '2025/2026', is_current: false },
    ];
    expect(selectRelevantSeasons(target, seasons).map(season => season.name)).toEqual(['2026/2027 Apertura', '2026/2027 Clausura']);
  });

  it('keeps a unique exact owner when a weaker canonical target overlaps', () => {
    const targets = [
      FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'saudi-pro-league')!,
      FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'saudi-pro-league-playoffs')!,
    ];
    const shared = league(1, 'Pro League Play-offs', 'Saudi Arabia', 'SA');
    const results = classifyAccessibleCoverage(targets, [shared]);
    expect(results[0].classification).toBe(CompetitionCoverageStatus.NOT_FOUND);
    expect(results[1].classification).toBe(CompetitionCoverageStatus.SUPPORTED);
  });

  it('does not map a generic one-word competition to a broader international tournament', () => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === 'champions-league')!;
    const [result] = classifyAccessibleCoverage([target], [league(9, 'Championship', 'England', 'GB')]);
    expect(result.classification).toBe(CompetitionCoverageStatus.NOT_FOUND);
  });
});
