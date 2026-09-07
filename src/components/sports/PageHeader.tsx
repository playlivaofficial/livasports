import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import type { FreshnessState } from '@/delivery/types';
import { FreshnessIndicator } from './DataStates';

export function PageHeader({ locale, page, currentDate, freshness }: {
  locale: SiteLocale;
  page: PageKey;
  currentDate: string;
  freshness: FreshnessState;
}) {
  const dictionary = getDictionary(locale);

  return <header className="page-header">
    <div className="page-context">
      <span>{dictionary.countryName}</span>
      <span className="page-context-dot" aria-hidden="true" />
      <span>{currentDate}</span>
    </div>
    <div className="page-heading-row">
      <div>
        <h1 className="page-title">{dictionary.pages[page].title}</h1>
        <p className="page-description">{dictionary.pages[page].description}</p>
      </div>
      <FreshnessIndicator locale={locale} state={freshness} />
    </div>
  </header>;
}
