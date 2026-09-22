import type { FixtureStatus } from '@/domain/enums';
import type { SiteLocale } from '@/config/i18n';
import type {OddsComparison} from '@/odds/types';

export type MatchModuleState = 'AVAILABLE' | 'NOT_YET_AVAILABLE' | 'NOT_COVERED' | 'NO_DATA_IN_WINDOW' | 'NOT_APPLICABLE' | 'ERROR' | 'STALE';

export interface MatchModule<T> {
  state: MatchModuleState;
  data: T;
  providerUpdatedAt: string | null;
  lastSuccessfulRefreshAt: string | null;
  snapshotAt: string | null;
}

export interface MatchTeamView { id: string; publicId: string; name: string; shortName: string | null; imageUrl: string | null; }
export interface MatchScoreView { description: string; home: number | null; away: number | null; }
export interface MatchHeaderView {
  id: string; publicId: string; locale: SiteLocale; competitionId: string; competition: string; competitionSlug: string;
  competitionType: string; seasonId: string | null; season: string | null; round: string | null; stage: string | null;
  providerStageId: number | null; providerGroupId: number | null; group: string | null; venue: string | null; venueCity: string | null; kickoff: string; status: FixtureStatus;
  home: MatchTeamView; away: MatchTeamView; homeScore: number | null; awayScore: number | null;
  scores: MatchScoreView[]; providerUpdatedAt: string | null;
}

export interface MatchEventView {
  id: string; type: string; periodId: number | null; minute: number | null; extraMinute: number | null;
  teamId: string | null; playerName: string | null; relatedPlayerName: string | null; result: string | null;
  playerPublicId: string | null; relatedPlayerPublicId: string | null; detail: string | null; rescinded: boolean;
}
export interface MatchStatisticView { type: string; home: number | string | null; away: number | string | null; unit: string | null; scope: string; }
export interface MatchLineupPlayerView { id: string; playerPublicId: string | null; teamId: string; name: string; starter: boolean; positionId: number | null; formationField: string | null; jerseyNumber: number | null; statistics: Array<{ code:string; label:string; value:number|string }>; }
export interface MatchLineupTeamView { teamId: string; formation: string | null; coach: string | null; starters: MatchLineupPlayerView[]; substitutes: MatchLineupPlayerView[]; }
export interface MatchPlayerPerformanceView { playerId: string; playerPublicId: string; player: string; teamId: string; team: string;
  statistics: Array<{ code:string; label:string; value:number|string }> }
export interface MatchStandingView { teamId: string; teamPublicId: string; team: string; position: number; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; goalDifference: number | null; points: number | null; highlighted: boolean; }
export interface MatchHistoryView { id: string; publicId: string; kickoff: string; home: string; away: string; homeScore: number | null; awayScore: number | null; status: FixtureStatus; perspective: 'W' | 'D' | 'L' | null; }
export interface MatchFormView { home: MatchHistoryView[]; away: MatchHistoryView[]; headToHead: MatchHistoryView[]; }
export interface MatchOddsPriceView { bookmaker: string; market: string; outcome: string; line: number | null; decimalOdds: number; providerUpdatedAt: string; affiliateEligible: boolean; affiliateUrl: string | null; }
/**
 * M1: where a finished match sends a reader (and a crawler) next. `relation` records why the fixture
 * was chosen so the UI can label it truthfully — a fixture involving one of these teams outranks
 * another fixture in the same competition.
 */
export interface NextMatchView {
  publicId: string; kickoff: string; competition: string; competitionSlug: string; relation: 'TEAM' | 'COMPETITION';
  home: { publicId: string; name: string }; away: { publicId: string; name: string };
}

export interface MatchCenterView {
  header: MatchHeaderView;
  events: MatchModule<MatchEventView[]>;
  statistics: MatchModule<MatchStatisticView[]>;
  lineups: MatchModule<MatchLineupTeamView[]>;
  playerStatistics: MatchModule<MatchPlayerPerformanceView[]>;
  standings: MatchModule<MatchStandingView[]>;
  form: MatchModule<MatchFormView>;
  odds: MatchModule<MatchOddsPriceView[]>;
  oddsComparisons?: OddsComparison[];
  /** M1: only loaded for a finished match, which would otherwise be a dead end. */
  nextMatches?: NextMatchView[];
  snapshotAt: string | null;
  liveSnapshotStale: boolean;
  providerRequests: 0;
}

export type MatchReadResult = { kind: 'found'; match: MatchCenterView } | { kind: 'not-found' };
