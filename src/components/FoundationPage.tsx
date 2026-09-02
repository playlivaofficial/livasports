import Link from 'next/link';
import { getDictionary, localeRoutes, type SiteLocale } from '@/config/i18n';

type PageKey = 'home' | 'football' | 'live' | 'today';

export function FoundationPage({ locale, page }: { locale: SiteLocale; page: PageKey }) {
  const dictionary = getDictionary(locale);
  const routes = localeRoutes[locale];
  const content = dictionary.pages[page];
  return (
    <main lang={dictionary.locale} className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href={routes.home} className="text-lg font-semibold tracking-tight">LivaSports</Link>
          <nav aria-label={dictionary.countryName} className="flex flex-wrap gap-4 text-sm text-slate-300">
            <Link href={routes.home}>{dictionary.navigation.home}</Link>
            <Link href={routes.football}>{dictionary.navigation.football}</Link>
            <Link href={routes.live}>{dictionary.navigation.live}</Link>
            <Link href={routes.today}>{dictionary.navigation.today}</Link>
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">{dictionary.status.foundation}</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{content.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{content.description}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-medium">{dictionary.status.noFabricatedData}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{dictionary.status.providerBoundary}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-medium">{dictionary.status.nextMilestone}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{dictionary.status.routeFoundation}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
