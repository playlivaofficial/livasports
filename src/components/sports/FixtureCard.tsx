import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { FixtureView } from '@/delivery/types';
import { FixtureStatus } from '@/domain/enums';
import { FreshnessIndicator } from './DataStates';
import { OddsComparison } from './OddsComparison';

export function MatchStatusBadge({ locale, status }: { locale: SiteLocale; status: FixtureStatus }) {
  const live = status === FixtureStatus.LIVE || status === FixtureStatus.HALFTIME;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${live ? 'bg-rose-500/15 text-rose-300' : status === FixtureStatus.FINISHED ? 'bg-slate-700 text-slate-200' : 'bg-emerald-500/10 text-emerald-300'}`}>
    {getDictionary(locale).statuses[status]}
  </span>;
}

export function KickoffTime({ locale, kickoff }: { locale: SiteLocale; kickoff: string }) {
  const dictionary = getDictionary(locale);
  const value = new Intl.DateTimeFormat(dictionary.locale, { timeZone: dictionary.timeZone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(kickoff));
  return <time dateTime={kickoff} className="text-sm tabular-nums text-slate-300">{value}</time>;
}

export function ScoreDisplay({ fixture }: { fixture: FixtureView }) {
  if (fixture.homeScore === null || fixture.awayScore === null) return <span className="text-lg font-semibold text-slate-600">—</span>;
  return <span className="text-xl font-black tabular-nums text-white">{fixture.homeScore} – {fixture.awayScore}</span>;
}

export function FixtureCard({ locale, fixture }: { locale: SiteLocale; fixture: FixtureView }) {
  return <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><KickoffTime locale={locale} kickoff={fixture.kickoff} /><MatchStatusBadge locale={locale} status={fixture.status} /></div>
    <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <p className="text-right font-semibold text-slate-100">{fixture.homeTeam}</p><ScoreDisplay fixture={fixture} /><p className="font-semibold text-slate-100">{fixture.awayTeam}</p>
    </div>
    <div className="mt-4"><FreshnessIndicator locale={locale} state={fixture.freshness} /></div>
    <OddsComparison locale={locale} fixture={fixture} />
  </article>;
}
