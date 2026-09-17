import Link from 'next/link';
import {AuthHeaderLink} from '@/auth/AuthHeaderLink';
import {FavoritesSync} from '@/favorites/FavoritesSync';
import {favoritesCopy,favoritesPath} from '@/localization/favorites-copy';
import type {PageKey} from '@/config/i18n';
import {interfaceDictionary as getDictionary,interfaceRoutes as localeRoutes,type InterfaceLocale as SiteLocale} from '@/localization/interface';
import {LanguageSelector} from '@/localization/LanguageSelector';
import {sportsCopy} from '@/sports/copy';
import {TimeZoneSelector} from '@/localization/TimeZoneSelector';
import {ThemeToggle} from './ThemeToggle';

export function SiteHeader({ locale, activePage, contentId = 'fixtures-content' }: { locale: SiteLocale; activePage: PageKey; localeHrefs?: { br: string; mx: string }; contentId?: string }) {
  const dictionary = getDictionary(locale);
  const routes = localeRoutes[locale];
  const items = [
    ['home', routes.home, dictionary.navigation.home], ['football', routes.football, dictionary.navigation.football],
    ['live', routes.live, dictionary.navigation.live], ['today', routes.today, dictionary.navigation.today],
  ] as const;
  return (
    <header className="app-header">
      <a className="skip-link" href={`#${contentId}`}>{dictionary.labels.skipToContent}</a>
      <div className="header-inner">
        <Link href={routes.home} className="brand" aria-label={`LivaSports · ${dictionary.countryName}`}>
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M10 7v18h13v-5h-8V7z" fill="currentColor"/><path d="m20 7 5 5-5 5" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></svg></span>
          <span>Liva<span className="brand-accent">Sports</span></span>
        </Link>
        <nav aria-label={dictionary.labels.primaryNavigation} className="main-nav">
          {items.map(([key, href, label]) => <Link key={key} href={href} aria-current={activePage === key ? 'page' : undefined} className={`nav-link nav-${key}`}>{key==='live'?<span className="nav-live-dot" aria-hidden="true"/>:null}{label}</Link>)}
        </nav>
        <div className="sports-header-actions"><FavoritesSync/><Link className="my-matches-header-link" href={favoritesPath(locale)} aria-label={favoritesCopy[locale].header}><span aria-hidden="true">★</span><span className="my-matches-header-text">{favoritesCopy[locale].nav}</span></Link><Link className="sports-search-link" href={`${routes.football}#sports-search`} aria-label={sportsCopy[locale].search}>{sportsCopy[locale].search}</Link>
        <TimeZoneSelector locale={locale}/><ThemeToggle locale={locale}/><LanguageSelector locale={locale}/><AuthHeaderLink locale={locale}/></div>
      </div>
    </header>
  );
}
