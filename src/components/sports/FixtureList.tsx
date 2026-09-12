import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { CompetitionSectionView } from '@/delivery/types';
import { competitionAnchor } from './CompetitionTabs';
import { FixtureCard } from './FixtureCard';
import {SponsoredSlot} from '@/components/commercial/SponsoredSlot';

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase();
}

export function CompetitionSection({ locale, section, pagePath }: { locale: SiteLocale; section: CompetitionSectionView;pagePath?:string }) {
  const dictionary = getDictionary(locale);
  const id = competitionAnchor(section.slug ?? section.competition);

  return <section id={id} aria-labelledby={`${id}-title`} className="competition-section">
    <header className="competition-header">
      <div className="competition-name-wrap">
        <span className="competition-emblem" aria-hidden="true">{initials(section.competition)}</span>
        <h2 id={`${id}-title`} className="competition-title">{section.competition}</h2>
      </div>
      <span className="competition-count">{section.fixtures.length} {dictionary.labels.matches}</span>
    </header>
    {section.fixtures.length ? <>
      <div className="fixture-table-head" aria-hidden="true">
        <span>{dictionary.labels.status}</span>
        <span>{dictionary.labels.teams}</span>
        <span>{dictionary.labels.score}</span>
        <span>{dictionary.labels.odds}</span>
      </div>
      <div>{section.fixtures.map(fixture => <FixtureCard key={fixture.id} locale={locale} fixture={fixture} />)}</div>
    </> : <p className="competition-empty-state" role="status">{dictionary.labels.competitionEmptyPeriod}</p>}
    {pagePath&&section.slug?<SponsoredSlot context={{locale,pagePath,placement:'competition_inline',competitionSlug:section.slug}}/>:null}
  </section>;
}

export function FixtureList({ locale, sections, pagePath }: { locale: SiteLocale; sections: readonly CompetitionSectionView[];pagePath?:string }) {
  return <div className="fixture-list">{sections.map((section,index) => <CompetitionSection key={section.competition} locale={locale} section={section} pagePath={index===0?pagePath:undefined}/>)}</div>;
}
