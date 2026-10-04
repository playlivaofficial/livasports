import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { CompetitionSectionView } from '@/delivery/types';
import {withSpanishLocales} from '@/localization/spanish';

export function competitionAnchor(name?: string): string {
  const slug = (name ?? 'fixtures').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `competition-${slug || 'fixtures'}`;
}

const groupLabels: Record<SiteLocale, Record<string, string>> = withSpanishLocales({
  br: { BRAZIL: 'Brasil', EUROPE: 'Europa', AMERICAS: 'Américas', INTERNATIONAL: 'Seleções', OTHER: 'Outros' },
  mx: { BRAZIL: 'Brasil', EUROPE: 'Europa', AMERICAS: 'Américas', INTERNATIONAL: 'Selecciones', OTHER: 'Otros' },
});

export function CompetitionTabs({ locale, sections }: { locale: SiteLocale; sections: readonly CompetitionSectionView[] }) {
  const dictionary = getDictionary(locale);
  if (!sections.length) return null;
  const groups = new Map<string, CompetitionSectionView[]>();
  for (const section of sections) {
    const group = section.group ?? 'OTHER';
    const rows = groups.get(group) ?? [];
    rows.push(section);
    groups.set(group, rows);
  }
  const orderedGroups = [...groups.entries()].sort((a,b)=>Math.min(...a[1].map(s=>s.priority))-Math.min(...b[1].map(s=>s.priority))||a[0].localeCompare(b[0]));

  return <section className="context-panel competition-panel" aria-label={dictionary.labels.competitions}>
    <h2 className="context-panel-title">{dictionary.labels.competitions}</h2>
    <nav className="competition-tabs" aria-label={dictionary.labels.competitions}>
      <a className="competition-tab is-active" href="#fixtures-content" aria-current="location">
        <span className="competition-tab-marker" aria-hidden="true" />
        {dictionary.labels.allCompetitions}
      </a>
      {orderedGroups.map(([group, competitions]) => <div className="competition-tab-group" key={group}>
        <span className="competition-tab-group-label">{groupLabels[locale][group] ?? group}</span>
        <div className="competition-tab-group-links">
          {competitions.map(competition => <a key={competition.slug ?? competition.competition} className="competition-tab" href={`#${competitionAnchor(competition.slug ?? competition.competition)}`}>
            <span className="competition-tab-marker" aria-hidden="true" />
            {competition.competition}
          </a>)}
        </div>
      </div>)}
    </nav>
  </section>;
}

export function FixtureSummary({ locale, live, upcoming, finished }: { locale: SiteLocale; live: number; upcoming: number; finished: number }) {
  const dictionary = getDictionary(locale);
  const rows = [
    { label: dictionary.statuses.LIVE, value: live, className: 'is-live' },
    { label: dictionary.statuses.SCHEDULED, value: upcoming, className: 'is-upcoming' },
    { label: dictionary.statuses.FINISHED, value: finished, className: '' },
  ];

  return <section className="context-panel scoreboard-summary" aria-label={dictionary.labels.overview}>
    <h2 className="context-panel-title">{dictionary.labels.overview}</h2>
    <div className="status-summary">
      {rows.map(row => <div className="summary-item" key={row.label}>
        <span className={`summary-dot ${row.className}`} aria-hidden="true" />
        <span className="summary-label">{row.label}</span>
        <strong className="summary-count">{row.value}</strong>
      </div>)}
    </div>
  </section>;
}
