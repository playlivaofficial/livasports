import type { CompetitionSectionView } from '@/delivery/types';
import type { SiteLocale } from '@/config/i18n';
import { FixtureCard } from './FixtureCard';

export function CompetitionSection({ locale, section }: { locale: SiteLocale; section: CompetitionSectionView }) {
  return <section aria-labelledby={`competition-${section.fixtures[0]?.id}`} className="space-y-3">
    <div className="flex items-center gap-3"><span aria-hidden="true" className="h-5 w-1 rounded-full bg-emerald-400" /><h2 id={`competition-${section.fixtures[0]?.id}`} className="text-lg font-bold text-white">{section.competition}</h2></div>
    <div className="grid gap-3">{section.fixtures.map(fixture => <FixtureCard key={fixture.id} locale={locale} fixture={fixture} />)}</div>
  </section>;
}

export function FixtureList({ locale, sections }: { locale: SiteLocale; sections: readonly CompetitionSectionView[] }) {
  return <div className="space-y-8">{sections.map(section => <CompetitionSection key={section.competition} locale={locale} section={section} />)}</div>;
}
