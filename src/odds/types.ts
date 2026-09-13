export type OddsMarket = 'MATCH_WINNER' | 'TOTAL_GOALS' | 'BTTS';
export type OddsOutcome = 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER' | 'YES' | 'NO';
export type OddsStatus = 'ACTIVE' | 'STALE' | 'SUSPENDED' | 'CLOSED';
export type MatchConfidence = 'EXACT' | 'HIGH_CONFIDENCE' | 'AMBIGUOUS' | 'NO_MATCH' | 'TIME_MISMATCH' | 'TEAM_MISMATCH' | 'COMPETITION_MISMATCH';
export const SELECTIONS: Record<OddsMarket, readonly OddsOutcome[]> = {
  MATCH_WINNER: ['HOME','DRAW','AWAY'], TOTAL_GOALS: ['OVER','UNDER'], BTTS: ['YES','NO'],
};
/** Near-kickoff one-feed paid interval. Public current-price lifetime follows scheduler cadence plus one tick. */
export const ODDS_TTL_MS = 15 * 60 * 1000;
export const KICKOFF_TOLERANCE_MS = 10 * 60 * 1000;
export interface CanonicalOddsFixture {
  id: string; competitionId: string; competition: string; sport: string; kickoff: string; status: string;
  homeId: string; home: string; awayId: string; away: string;
}
export interface ProviderOddsFixture {
  providerId: string; sport: string; competition: string | null; providerCompetitionId: string;
  kickoff: string; status: 'PREGAME' | 'OTHER'; homeProviderId: string; awayProviderId: string;
  homeNames: string[]; awayNames: string[];
}
export interface NormalizedOddsQuote {
  providerFixtureId: string; bookmaker: string; market: OddsMarket; outcome: OddsOutcome; line: number | null;
  decimalOdds: string; status: OddsStatus; scope: 'FULL_TIME_REGULATION'; phase: 'PREGAME';
  providerUpdatedAt: string | null; observedAt: string; sourceDomain: string | null;
}
export interface OddsSnapshot {
  bookmaker: string; observedAt: string; fixtures: ProviderOddsFixture[]; quotes: NormalizedOddsQuote[];
  rejected: Record<string,number>; tournamentIds: string[];
}
export interface PersistedFixtureMapping { providerId: string; fixtureId: string; homeProviderId: string; awayProviderId: string; canonicalKickoff?: string | null; providerKickoff?: string | null; }
export interface FixtureMatch { state: MatchConfidence; fixture: CanonicalOddsFixture | null; reason: string; }
export interface OddsProvider {
  snapshot(bookmaker: string, tournamentIds: readonly string[]): Promise<OddsSnapshot>;
}
export interface ReadOddsQuote extends NormalizedOddsQuote {
  fixtureId: string; bookmakerId: string; bookmakerName: string; geoEligible: boolean;
  persistedAt: string; lastSuccessfulRefreshAt: string; providerKickoff: string;
}
export interface OddsReadSnapshot { quotes: ReadOddsQuote[]; kickoff: string; fixtureStatus: string; }
export interface OddsCell { outcome: OddsOutcome; decimalOdds: string | null; state: OddsStatus | 'UNAVAILABLE'; best: boolean; expiresAt: string | null; }
export interface OddsBookmakerRow { bookmaker: string; name: string; cells: OddsCell[]; action: string | null; }
export interface OddsComparison {
  market: OddsMarket; line: number | null; rows: OddsBookmakerRow[];
  observedAt: string | null; providerUpdatedAt: string | null; expiresAt: string | null; closesAt?: string | null; eligiblePrices: number;
}
