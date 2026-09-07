import Link from 'next/link';
import { getDictionary, localeRoutes, type PageKey, type SiteLocale } from '@/config/i18n';

export function SiteHeader({ locale, activePage }: { locale: SiteLocale; activePage: PageKey }) {
  const dictionary = getDictionary(locale);
  const routes = localeRoutes[locale];
  const items = [
    ['home', routes.home, dictionary.navigation.home], ['football', routes.football, dictionary.navigation.football],
    ['live', routes.live, dictionary.navigation.live], ['today', routes.today, dictionary.navigation.today],
  ] as const;
  return (
    <header className="border-b border-slate-800 bg-slate-950/95">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href={routes.home} className="text-xl font-black tracking-tight text-white">Liva<span className="text-emerald-400">Sports</span></Link>
        <nav aria-label={dictionary.countryName} className="flex gap-1 overflow-x-auto rounded-xl bg-slate-900 p-1 text-sm">
          {items.map(([key, href, label]) => <Link key={key} href={href} aria-current={activePage === key ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 transition ${activePage === key ? 'bg-emerald-400 font-semibold text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>{label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
