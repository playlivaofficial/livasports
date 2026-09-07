import { connection } from 'next/server';
import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import { loadM3PageData } from '@/delivery/runtime';
import { FixtureStatus } from '@/domain/enums';
import { CompetitionTabs, FixtureSummary } from './CompetitionTabs';
import { EmptyState, ProviderErrorNotice } from './DataStates';
import { FixtureList } from './FixtureList';
import { PageHeader } from './PageHeader';
import { SiteHeader } from './SiteHeader';

export async function M2SportsPage({ locale, page }: { locale: SiteLocale; page: PageKey }) {
  await connection();
  const data = await loadM3PageData(locale, page);
  const dictionary = getDictionary(locale);
  const fixtures = data.sections.flatMap(section => section.fixtures);
  const live = fixtures.filter(fixture => fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALFTIME).length;
  const upcoming = fixtures.filter(fixture => fixture.status === FixtureStatus.SCHEDULED).length;
  const finished = fixtures.filter(fixture => fixture.status === FixtureStatus.FINISHED).length;
  const mexicoNoCoverage = locale === 'mx' && data.sportsData.reason === 'no-data';

  return <div lang={dictionary.locale} className="app-shell">
    <SiteHeader locale={locale} activePage={page} />
    <main id="fixtures-content" className="page-container">
      <PageHeader locale={locale} page={page} currentDate={data.currentDate} freshness={data.sportsData.freshness} />
      <div className="sports-layout">
        <aside className="context-rail">
          <FixtureSummary locale={locale} live={live} upcoming={upcoming} finished={finished} />
          <CompetitionTabs locale={locale} competitions={data.competitions} />
        </aside>
        <div className="fixture-content">
          {data.sportsData.state === 'unavailable' ? <ProviderErrorNotice locale={locale} provider="sports" /> : null}
          {fixtures.length > 0 && (data.oddsData.state === 'unavailable' || data.oddsData.state === 'not-configured') ? <ProviderErrorNotice locale={locale} provider="odds" /> : null}
          {data.sections.length > 0
            ? <FixtureList locale={locale} sections={data.sections} />
            : <EmptyState locale={locale} live={page === 'live'} coverageUnavailable={mexicoNoCoverage} />}
        </div>
      </div>
    </main>
  </div>;
}
