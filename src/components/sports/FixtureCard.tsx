import { getDictionary, type SiteLocale } from '@/config/i18n';
import type { FixtureView } from '@/delivery/types';
import { FixtureStatus } from '@/domain/enums';
import { OddsComparison } from './OddsComparison';
import { TeamMark } from './TeamMark';

function isLive(status: FixtureStatus): boolean {
  return status === FixtureStatus.LIVE || status === FixtureStatus.HALFTIME;
}

function statusClass(status: FixtureStatus): string {
  if (isLive(status)) return 'is-live';
  if (status === FixtureStatus.FINISHED) return 'is-finished';
  if (status === FixtureStatus.POSTPONED) return 'is-warning';
  if (status === FixtureStatus.CANCELLED || status === FixtureStatus.ABANDONED) return 'is-cancelled';
  return '';
}

function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const source = parts.length > 1 ? [parts[0], parts.at(-1) ?? ''] : parts;
  return source.slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() || '—';
}

export function FixtureStatusBadge({ locale, status }: { locale: SiteLocale; status: FixtureStatus }) {
  return <span className={`status-badge ${statusClass(status)}`}>{getDictionary(locale).statuses[status]}</span>;
}

export const MatchStatusBadge = FixtureStatusBadge;

export function KickoffTime({ locale, kickoff }: { locale: SiteLocale; kickoff: string }) {
  const dictionary = getDictionary(locale);
  const date = new Date(kickoff);
  const time = new Intl.DateTimeFormat(dictionary.locale, { timeZone: dictionary.timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
  const day = new Intl.DateTimeFormat(dictionary.locale, { timeZone: dictionary.timeZone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);

  return <time dateTime={kickoff}>
    <span className="kickoff-time">{time}</span>
    <span className="kickoff-date">{day}</span>
  </time>;
}

export function TeamIdentity({ name, shortName, imageUrl }: { name: string; shortName?: string | null; imageUrl?: string | null }) {
  return <span className="team-identity">
    <TeamMark initials={teamInitials(shortName || name)} imageUrl={imageUrl} />
    <span className="team-name">{name}</span>
  </span>;
}

export function ScoreDisplay({ fixture }: { fixture: FixtureView }) {
  const missing = fixture.homeScore === null || fixture.awayScore === null;
  return <span className="score-stack" aria-label={missing ? undefined : `${fixture.homeScore} – ${fixture.awayScore}`}>
    <span className={`score-value ${missing ? 'is-empty' : ''}`}>{missing ? '—' : fixture.homeScore}</span>
    <span className={`score-value ${missing ? 'is-empty' : ''}`}>{missing ? '—' : fixture.awayScore}</span>
  </span>;
}

export function FixtureCard({ locale, fixture }: { locale: SiteLocale; fixture: FixtureView }) {
  const dictionary = getDictionary(locale);
  return <article className={`fixture-row ${isLive(fixture.status) ? 'is-live' : ''}`} aria-label={`${fixture.homeTeam} – ${fixture.awayTeam}`}>
    <div className="fixture-timing">
      <KickoffTime locale={locale} kickoff={fixture.kickoff} />
      <FixtureStatusBadge locale={locale} status={fixture.status} />
    </div>
    <div className="team-stack">
      <TeamIdentity name={fixture.homeTeam} shortName={fixture.homeTeamShortName} imageUrl={fixture.homeTeamImageUrl} />
      <TeamIdentity name={fixture.awayTeam} shortName={fixture.awayTeamShortName} imageUrl={fixture.awayTeamImageUrl} />
    </div>
    <ScoreDisplay fixture={fixture} />
    <OddsComparison locale={locale} fixture={fixture} emptyLabel={dictionary.labels.noOdds} />
  </article>;
}
