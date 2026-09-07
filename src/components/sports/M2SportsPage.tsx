import { connection } from 'next/server';
import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import { loadM3PageData } from '@/delivery/runtime';
import { FixtureStatus } from '@/domain/enums';
import { EmptyState, FreshnessIndicator, ProviderErrorNotice } from './DataStates';
import { FixtureList } from './FixtureList';
import { SiteHeader } from './SiteHeader';

export async function M2SportsPage({ locale, page }: { locale: SiteLocale; page: PageKey }) {
  await connection();
  const data = await loadM3PageData(locale, page);
  const dictionary = getDictionary(locale);
  const fixtures = data.sections.flatMap(section => section.fixtures);
  const live = fixtures.filter(fixture => fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALFTIME).length;
  const upcoming = fixtures.filter(fixture => fixture.status === FixtureStatus.SCHEDULED).length;
  const finished = fixtures.filter(fixture => fixture.status === FixtureStatus.FINISHED).length;
  return <main lang={dictionary.locale} className="min-h-screen bg-slate-950 text-slate-100">
    <SiteHeader locale={locale} activePage={page} />
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mb-8">
        <p className="text-sm font-medium text-emerald-300">{dictionary.labels.currentDate}: {data.currentDate}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{dictionary.pages[page].title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">{dictionary.pages[page].description}</p>
        <div className="mt-5"><FreshnessIndicator locale={locale} state={data.sportsData.freshness} /></div>
      </section>
      {data.sportsData.state === 'unavailable' ? <ProviderErrorNotice locale={locale} provider="sports" /> : null}
      {fixtures.length && (data.oddsData.state === 'unavailable' || data.oddsData.state === 'not-configured') ? <div className="mt-4"><ProviderErrorNotice locale={locale} provider="odds" /></div> : null}
      <section aria-label={dictionary.labels.fixtures} className="my-8 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4"><p className="text-xs text-rose-200">{dictionary.statuses[FixtureStatus.LIVE]}</p><strong className="mt-1 block text-2xl">{live}</strong></div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><p className="text-xs text-emerald-200">{dictionary.statuses[FixtureStatus.SCHEDULED]}</p><strong className="mt-1 block text-2xl">{upcoming}</strong></div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><p className="text-xs text-slate-300">{dictionary.statuses[FixtureStatus.FINISHED]}</p><strong className="mt-1 block text-2xl">{finished}</strong></div>
      </section>
      {data.competitions.length ? <section className="mb-8"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{dictionary.labels.competitions}</h2>
        <div className="flex flex-wrap gap-2">{data.competitions.map(competition => <span key={competition} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200">{competition}</span>)}</div></section> : null}
      {data.sections.length ? <FixtureList locale={locale} sections={data.sections} /> : <EmptyState locale={locale} live={page === 'live'} />}
    </div>
  </main>;
}
