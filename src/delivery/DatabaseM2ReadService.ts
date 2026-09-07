import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import type { FootballReadRepository } from '@/ingestion/store';
import { deliveryWindow } from './time';
import { filterFixturesForPage, groupFixtureViews, stableSortFixtures } from './fixtures';
import type { FixtureView, M2PageData, ProviderState } from './types';

const noDataState = (): ProviderState => ({ state: 'available', freshness: 'fresh', reason: 'no-data' });
const unavailable = (): ProviderState => ({ state: 'unavailable', freshness: 'unavailable', reason: 'provider-error' });

export class DatabaseM2ReadService {
  constructor(private readonly repository: FootballReadRepository, private readonly now: () => Date = () => new Date()) {}

  async load(locale: SiteLocale, page: PageKey): Promise<M2PageData> {
    const now = this.now();
    const dictionary = getDictionary(locale);
    const base = { locale, page, currentDate: new Intl.DateTimeFormat(dictionary.locale, { dateStyle: 'full', timeZone: dictionary.timeZone }).format(now), timeZone: dictionary.timeZone };
    try {
      const window = deliveryWindow(locale, page, now);
      const rows = await this.repository.listFixtures(dictionary.countryCode, window.from, window.to);
      const rowById = new Map(rows.map(row => [row.fixture.id, row]));
      const selected = stableSortFixtures(filterFixturesForPage(rows.map(row => row.fixture), page, now, dictionary.timeZone));
      const views: FixtureView[] = selected.flatMap(fixture => {
        const row = rowById.get(fixture.id);
        if (!row) return [];
        return [{ id: fixture.id, competition: row.competitionName, homeTeam: row.homeTeamName, awayTeam: row.awayTeamName,
          kickoff: fixture.kickoff.toISOString(), status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore,
          freshness: 'fresh', odds: [], oddsState: 'none' }];
      });
      const sportsData: ProviderState = views.length ? { state: 'available', freshness: 'fresh', reason: 'ok' } : noDataState();
      return { ...base, sportsData, oddsData: noDataState(), competitions: [...new Set(views.map(row => row.competition))].sort(),
        sections: groupFixtureViews(views), paidOddsRequests: 0 };
    } catch {
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
