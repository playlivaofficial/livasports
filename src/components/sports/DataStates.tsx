import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { FreshnessState } from '@/delivery/types';

export function FreshnessIndicator({ locale, state, updatedAt }: { locale: SiteLocale; state: FreshnessState; updatedAt?: string }) {
  const dictionary = getDictionary(locale);
  const label = state === 'fresh' ? dictionary.labels.providerFresh : state === 'stale' ? dictionary.labels.providerStale : dictionary.labels.sportsUnavailable;
  return <span className={`inline-flex items-center gap-2 text-xs ${state === 'fresh' ? 'text-emerald-300' : 'text-amber-300'}`}>
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${state === 'fresh' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
    {label}{updatedAt ? ` · ${dictionary.labels.updatedAt} ${updatedAt}` : ''}
  </span>;
}

export function ProviderErrorNotice({ locale, provider }: { locale: SiteLocale; provider: 'sports' | 'odds' }) {
  const dictionary = getDictionary(locale);
  return <aside role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
    {provider === 'sports' ? dictionary.labels.sportsUnavailable : dictionary.labels.oddsUnavailable}
  </aside>;
}

export function PartialDataNotice({ locale }: { locale: SiteLocale }) {
  return <p className="mt-3 text-xs text-amber-300">{getDictionary(locale).labels.partialOdds}</p>;
}

export function EmptyState({ locale, live = false }: { locale: SiteLocale; live?: boolean }) {
  const dictionary = getDictionary(locale);
  return <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-12 text-center">
    <p className="text-base font-medium text-slate-200">{live ? dictionary.labels.noLiveFixtures : dictionary.labels.noFixtures}</p>
  </section>;
}

export function LoadingState({ locale }: { locale: SiteLocale }) {
  const dictionary = getDictionary(locale);
  return <main lang={dictionary.locale} className="min-h-screen bg-slate-950 px-6 py-20 text-slate-100">
    <div role="status" className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
      <div className="mb-5 h-2 w-24 animate-pulse rounded bg-emerald-400" />
      <h1 className="text-xl font-semibold">{dictionary.labels.loading}</h1>
      <p className="mt-2 text-sm text-slate-400">{dictionary.labels.loadingDescription}</p>
    </div>
  </main>;
}
