import type { PageKey, SiteLocale } from '@/config/i18n';

const prefix = 'livasports:v1';
const clean = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');

export const cacheKeys = {
  competitionList: (locale: SiteLocale) => `${prefix}:competition:list:${locale}`,
  teams: (competitionId: string) => `${prefix}:teams:competition:${clean(competitionId)}`,
  routeData: (locale: SiteLocale, page: PageKey, localDate: string) => `${prefix}:route:v3:${locale}:${page}:${localDate}`,
  fixturesToday: (locale: SiteLocale) => `${prefix}:fixtures:today:${locale}`,
  fixturesLive: (locale: SiteLocale) => `${prefix}:fixtures:live:${locale}`,
  fixturesCompetition: (competitionId: string) => `${prefix}:fixtures:competition:${clean(competitionId)}`,
  fixture: (fixtureId: string) => `${prefix}:fixture:${clean(fixtureId)}`,
  matchModule: (fixtureId: string, locale: SiteLocale, scope: string) => `${prefix}:match:v2:${clean(fixtureId)}:${locale}:${clean(scope)}`,
  teamProfile: (publicId: string, locale: SiteLocale) => `${prefix}:profile:v3:team:${clean(publicId)}:${locale}`,
  playerProfile: (publicId: string, locale: SiteLocale) => `${prefix}:profile:v4:player:${clean(publicId)}:${locale}`,
  teamProfileTag: (publicId: string) => `${prefix}:profile:team:${clean(publicId)}`,
  playerProfileTag: (publicId: string) => `${prefix}:profile:player:${clean(publicId)}`,
  standings: (competitionId: string) => `${prefix}:standings:${clean(competitionId)}`,
  odds: (fixtureId: string) => `${prefix}:odds:${clean(fixtureId)}`,
} as const;

export function routeCacheTags(locale: SiteLocale, page: PageKey): string[] {
  const tags = [cacheKeys.competitionList(locale)];
  if (page === 'live') tags.push(cacheKeys.fixturesLive(locale));
  else if (page === 'home' || page === 'today') tags.push(cacheKeys.fixturesToday(locale));
  else tags.push(`${prefix}:fixtures:${locale}`);
  return tags;
}

export function fixtureChangeTags(fixtureIds: readonly string[]): string[] {
  return [...new Set([
    cacheKeys.fixturesToday('br'), cacheKeys.fixturesLive('br'), `${prefix}:fixtures:br`,
    cacheKeys.fixturesToday('mx'), cacheKeys.fixturesLive('mx'), `${prefix}:fixtures:mx`,
    ...fixtureIds.map(cacheKeys.fixture),
  ])];
}
