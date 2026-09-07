import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { CompetitionSectionView } from '@/delivery/types';
import { competitionAnchor } from './CompetitionTabs';
import { FixtureCard } from './FixtureCard';

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase();
}

export function CompetitionSection({ locale, section }: { locale: SiteLocale; section: CompetitionSectionView }) {
  const dictionary = getDictionary(locale);
  const id = competitionAnchor(section.competition);

  return <section id={id} aria-labelledby={`${id}-title`} className="competition-section">
    <header className="competition-header">
      <div className="competition-name-wrap">
        <span className="competition-emblem" aria-hidden="true">{initials(section.competition)}</span>
        <h2 id={`${id}-title`} className="competition-title">{section.competition}</h2>
      </div>
      <span className="competition-count">{section.fixtures.length} {dictionary.labels.matches}</span>
    </header>
    <div className="fixture-table-head" aria-hidden="true">
      <span>{dictionary.labels.status}</span>
      <span>{dictionary.labels.teams}</span>
      <span>{dictionary.labels.score}</span>
      <span>{dictionary.labels.odds}</span>
    </div>
    <div>{section.fixtures.map(fixture => <FixtureCard key={fixture.id} locale={locale} fixture={fixture} />)}</div>
  </section>;
}

export function FixtureList({ locale, sections }: { locale: SiteLocale; sections: readonly CompetitionSectionView[] }) {
  return <div className="fixture-list">{sections.map(section => <CompetitionSection key={section.competition} locale={locale} section={section} />)}</div>;
}
