import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { FreshnessState } from '@/delivery/types';

export function FreshnessIndicator({ locale, state, updatedAt }: { locale: SiteLocale; state: FreshnessState; updatedAt?: string }) {
  const dictionary = getDictionary(locale);
  const label = state === 'fresh' ? dictionary.labels.providerFresh : state === 'stale' ? dictionary.labels.providerStale : dictionary.labels.sportsUnavailable;

  return <span className={`freshness ${state === 'fresh' ? 'is-fresh' : ''}`}>
    <span aria-hidden="true" className="freshness-dot" />
    {label}{updatedAt ? ` · ${dictionary.labels.updatedAt} ${updatedAt}` : ''}
  </span>;
}

export function ProviderErrorNotice({ locale, provider }: { locale: SiteLocale; provider: 'sports' | 'odds' }) {
  const dictionary = getDictionary(locale);
  return <aside role="status" className="data-notice">
    {provider === 'sports' ? dictionary.labels.sportsUnavailable : dictionary.labels.oddsUnavailable}
  </aside>;
}

export function PartialDataNotice({ locale }: { locale: SiteLocale }) {
  return <p className="partial-data">{getDictionary(locale).labels.partialOdds}</p>;
}

export function EmptyState({ locale, live = false, coverageUnavailable = false }: {
  locale: SiteLocale;
  live?: boolean;
  coverageUnavailable?: boolean;
}) {
  const dictionary = getDictionary(locale);
  const title = coverageUnavailable ? dictionary.labels.coverageUnavailable : live ? dictionary.labels.noLiveFixtures : dictionary.labels.noFixtures;
  const description = coverageUnavailable ? dictionary.labels.coverageUnavailableDescription : live ? dictionary.labels.noLiveDescription : dictionary.labels.noFixturesDescription;

  return <section className="empty-state" aria-labelledby="empty-state-title">
    <span className="empty-icon" aria-hidden="true" />
    <div className="empty-copy">
      <h2 id="empty-state-title">{title}</h2>
      <p>{description}</p>
    </div>
  </section>;
}

export function LoadingState({ locale }: { locale: SiteLocale }) {
  const dictionary = getDictionary(locale);
  return <main lang={dictionary.locale} className="loading-page" aria-busy="true">
    <div className="loading-header" />
    <div className="loading-shell" role="status" aria-label={`${dictionary.labels.loading}. ${dictionary.labels.loadingDescription}`}>
      <div className="skeleton skeleton-meta" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton-layout">
        <div className="skeleton skeleton-rail" />
        <div className="skeleton skeleton-list" />
      </div>
    </div>
  </main>;
}
