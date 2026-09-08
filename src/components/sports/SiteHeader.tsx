import Link from 'next/link';
import { getDictionary, localeRoutes, type PageKey, type SiteLocale } from '@/config/i18n';

export function SiteHeader({ locale, activePage, localeHrefs, contentId = 'fixtures-content' }: { locale: SiteLocale; activePage: PageKey; localeHrefs?: { br: string; mx: string }; contentId?: string }) {
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
          <span className="brand-mark" aria-hidden="true">LS</span>
          <span>Liva<span className="brand-accent">Sports</span></span>
        </Link>
        <nav aria-label={dictionary.labels.primaryNavigation} className="main-nav">
          {items.map(([key, href, label]) => <Link key={key} href={href} aria-current={activePage === key ? 'page' : undefined} className="nav-link">{label}</Link>)}
        </nav>
        <div className="locale-switcher" aria-label={dictionary.countryName}>
          <Link href={localeHrefs?.br ?? localeRoutes.br[activePage]} className="locale-link" aria-current={locale === 'br' ? 'true' : undefined} hrefLang="pt-BR">BR</Link>
          <Link href={localeHrefs?.mx ?? localeRoutes.mx[activePage]} className="locale-link" aria-current={locale === 'mx' ? 'true' : undefined} hrefLang="es-MX">MX</Link>
        </div>
      </div>
    </header>
  );
}
