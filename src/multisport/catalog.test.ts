import { describe, expect, it } from 'vitest';
import { competitionPath, competitions, isCatalogSport, snapshotEntityPath, snapshotSeasonToken, sportCompetitions, sportIds, sportsNamespace, sportsPath, translateSportsPath } from './catalog';
import { interfaceLocales } from '@/localization/interface';

describe('multisport catalog translation and canonical route boundaries', () => {
  it('keeps competition identities unique and bound to one supported sport', () => {
    expect(new Set(competitions.map(item => item.id)).size).toBe(competitions.length);
    for (const item of competitions) {
      expect(isCatalogSport(item.sport)).toBe(true);
      expect(sportCompetitions(item.sport)).toContain(item);
      expect(competitionPath('en', item.id)).toBe(`/en/sports/${item.sport}/${item.id}`);
    }
  });
  it.each(interfaceLocales)('translates directory, all sports and competitions reciprocally from %s', source => {
    for (const target of interfaceLocales) {
      expect(translateSportsPath(sportsPath(source), target)).toBe(sportsPath(target));
      for (const sport of sportIds) expect(translateSportsPath(sportsPath(source, sport), target)).toBe(sportsPath(target, sport));
      for (const competition of competitions) {
        const translated = translateSportsPath(competitionPath(source, competition.id), target);
        expect(translated).toBe(competitionPath(target, competition.id));
        expect(translateSportsPath(translated!, source)).toBe(competitionPath(source, competition.id));
      }
    }
  });
  it('preserves and canonicalizes encoded entity IDs across locales without changing identity', () => {
    for (const id of ['openligadb-team-40', 'TEST.Player_1:club', 'A'.repeat(128)]) {
      const source = sportsPath('en', 'football', 'bundesliga', encodeURIComponent(id));
      for (const target of interfaceLocales) expect(translateSportsPath(source, target)).toBe(sportsPath(target, 'football', 'bundesliga', encodeURIComponent(id)));
    }
    expect(translateSportsPath('/en/sports/football/bundesliga/entities/%41lpha%3A1', 'br')).toBe('/br/esportes/football/bundesliga/entities/Alpha%3A1');
  });
  it('rejects entity traversal, malformed encoding, and IDs outside the snapshot identifier contract', () => {
    for (const token of ['.', '..', '_invalid', ':invalid', '-invalid', '%2F', 'a%2Fb', '%252F', '%2e%2e%2Fbad', '%', '%ZZ', 'x'.repeat(129), '%00', '%3Cscript%3E']) {
      expect(translateSportsPath(`/en/sports/football/bundesliga/entities/${token}`, 'mx'), token).toBeNull();
    }
  });
  it('preserves archive season tokens across locales while rejecting malformed paths', () => {
    for (const season of ['2024', '2026-27']) {
      for (const target of interfaceLocales) expect(translateSportsPath(`/en/sports/football/bundesliga/season/${season}`, target)).toBe(`/${target}/${sportsNamespace(target)}/football/bundesliga/season/${season}`);
    }
    for (const suffix of ['season', 'season/', 'season/2026/27', 'season/2026%2F27', 'season/../', 'season/2026?x=1', 'season/2026/extra', 'season/' + '2'.repeat(33), 'season/%ZZ']) expect(translateSportsPath(`/en/sports/football/bundesliga/${suffix}`, 'br'), suffix).toBeNull();
  });
  it('rejects unknown competitions, wrong sport bindings and mismatched locale namespaces', () => {
    for (const path of ['/en/sports/chess', '/en/sports/basketball/bundesliga', '/en/sports/football/nba', '/en/sports/football/not-real', '/fr/sports', '/br/sports', '/en/esportes', '/en/sports/football/bundesliga/extra', 'https://evil.example/en/sports']) expect(translateSportsPath(path, 'mx'), path).toBeNull();
  });
  it('keeps archived entity identities and complex season labels stable across locales', () => {
    expect(snapshotSeasonToken('2025/26')).toBe('2025-26');
    expect(snapshotSeasonToken('Apertura 2026 (2026-2027)')).toBe('apertura-2026-2026-2027');
    const snapshot = { sport: 'football', competitionId: 'liga-mx', season: 'Apertura 2026 (2026-2027)' };
    const path = snapshotEntityPath('en', snapshot, 'TEST:old.club');
    for (const locale of interfaceLocales) expect(translateSportsPath(path, locale)).toBe(snapshotEntityPath(locale, snapshot, 'TEST:old.club'));
    for (const token of ['%2F', '..', '%ZZ', 'x'.repeat(129)]) expect(translateSportsPath(`/en/sports/football/liga-mx/season/2026/entities/${token}`, 'br')).toBeNull();
  });
});
