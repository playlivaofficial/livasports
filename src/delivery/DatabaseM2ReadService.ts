import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import type { FootballReadRepository } from '@/ingestion/store';
import { deliveryWindow,localDayRange,zonedDateTimeToUtc } from './time';
import { filterFixturesForPage, groupFixtureViews, stableSortFixtures } from './fixtures';
import type { FixtureView, M2PageData, ProviderState } from './types';

const noDataState = (): ProviderState => ({ state: 'available', freshness: 'fresh', reason: 'no-data' });
const unavailable = (): ProviderState => ({ state: 'unavailable', freshness: 'unavailable', reason: 'provider-error' });

export class DatabaseM2ReadService {
  constructor(private readonly repository: FootballReadRepository, private readonly now: () => Date = () => new Date()) {}

  async loadOrThrow(locale: SiteLocale, page: PageKey, selectedDate?:string, displayTimeZone?:string, competitionSlug?:string): Promise<M2PageData> {
    const dictionary = getDictionary(locale);
    const timeZone=displayTimeZone??dictionary.timeZone;
    const parts=selectedDate?.split('-').map(Number);
    const now = parts?zonedDateTimeToUtc({year:parts[0],month:parts[1],day:parts[2],hour:12},timeZone):this.now();
    const base = { locale, page, currentDate: new Intl.DateTimeFormat(dictionary.locale, { dateStyle: 'full', timeZone }).format(now), timeZone };
    const window = selectedDate?localDayRange(now,timeZone):deliveryWindow(locale,page,now,timeZone);
    if(competitionSlug&&!selectedDate&&page==='football')window.to=new Date(now.getTime()+45*86400000);
      const statuses = page === 'live' ? ['LIVE', 'HALFTIME'] : [];
      const [competitionRows, rows] = await Promise.all([
        this.repository.listCompetitions(dictionary.countryCode),
        this.repository.listFixtures(dictionary.countryCode, window.from, window.to, statuses,competitionSlug),
      ]);
      const rowById = new Map(rows.map(row => [row.fixture.id, row]));
      const selected = stableSortFixtures(filterFixturesForPage(rows.map(row => row.fixture), selectedDate?'today':page, now, timeZone));
      const views: FixtureView[] = selected.flatMap(fixture => {
        const row = rowById.get(fixture.id);
        if (!row) return [];
        return [{ id: fixture.id, publicId: row.publicId, competition: row.competitionName, homeTeam: row.homeTeamName, awayTeam: row.awayTeamName,
          competitionSlug: row.competitionSlug, competitionGroup: row.competitionGroup, competitionPriority: row.competitionPriority,
          homeTeamShortName: row.homeTeamShortName, awayTeamShortName: row.awayTeamShortName,
          homeTeamImageUrl: row.homeTeamImageUrl, awayTeamImageUrl: row.awayTeamImageUrl,
          kickoff: fixture.kickoff.toISOString(), status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore,
          freshness: 'fresh', odds: [], oddsState: 'none' }];
      });
      const sportsData: ProviderState = views.length ? { state: 'available', freshness: 'fresh', reason: 'ok' } : noDataState();
      const sections = groupFixtureViews(views, competitionRows.map(row => ({ competition: row.competitionName,
        slug: row.competitionSlug, group: row.competitionGroup, priority: row.competitionPriority })));
      return { ...base, sportsData, oddsData: noDataState(), competitions: sections.map(section => section.competition),
        sections, paidOddsRequests: 0 };
  }

  async load(locale: SiteLocale, page: PageKey): Promise<M2PageData> {
    try {
      return await this.loadOrThrow(locale, page);
    } catch {
      const now = this.now();
      const dictionary = getDictionary(locale);
      const base = { locale, page, currentDate: new Intl.DateTimeFormat(dictionary.locale, { dateStyle: 'full', timeZone: dictionary.timeZone }).format(now), timeZone: dictionary.timeZone };
      return { ...base, sportsData: unavailable(), oddsData: noDataState(), competitions: [], sections: [], paidOddsRequests: 0 };
    }
  }
}

export function emptyDatabasePage(locale: SiteLocale, page: PageKey, now = new Date()): M2PageData {
  const dictionary = getDictionary(locale);
  return { locale, page, currentDate: new Intl.DateTimeFormat(dictionary.locale, { dateStyle: 'full', timeZone: dictionary.timeZone }).format(now),
    timeZone: dictionary.timeZone, sportsData: { state: 'not-configured', freshness: 'unavailable', reason: 'credentials-missing' },
    oddsData: noDataState(), competitions: [], sections: [], paidOddsRequests: 0 };
}

export function unavailableDatabasePage(locale: SiteLocale, page: PageKey, now = new Date()): M2PageData {
  const empty = emptyDatabasePage(locale, page, now);
  return { ...empty, sportsData: unavailable() };
}
