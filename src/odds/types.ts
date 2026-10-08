import type {PoolRole} from './fallback-pool';
export type OddsMarket = 'MATCH_WINNER' | 'TOTAL_GOALS' | 'BTTS';
export type OddsOutcome = 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER' | 'YES' | 'NO';
export type OddsStatus = 'ACTIVE' | 'STALE' | 'SUSPENDED' | 'WITHDRAWN' | 'CLOSED';
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
  /** Present only for a verified country-specific feed. Legacy snapshots retain their original identity. */
  geoFeeds?:import('./operator-feeds').VerifiedOperatorFeed[];
  providerBookmakerId?:string;
  offerFlags?:Array<{providerFixtureId:string;market:string;outcome:string;bookmakerActive:boolean|null;bookmakerSuspended:boolean|null;marketActive:boolean|null;priceActive:boolean|null}>;
  diagnostics?:Array<{providerFixtureId:string;tournamentId:string;market:string;outcome:string;reason:string;evidence:Record<string,unknown>}>;
  cadenceScale?: number;
  provider?: string; bookmaker: string; observedAt: string; fixtures: ProviderOddsFixture[]; quotes: NormalizedOddsQuote[];
  rejected: Record<string,number>; tournamentIds: string[];
}
export interface PersistedFixtureMapping { providerId: string; fixtureId: string; homeProviderId: string; awayProviderId: string; canonicalKickoff?: string | null; providerKickoff?: string | null; }
export interface FixtureMatch { state: MatchConfidence; fixture: CanonicalOddsFixture | null; reason: string; }
export interface OddsProvider {
  snapshot(bookmaker: string, tournamentIds: readonly string[]): Promise<OddsSnapshot>;
}
export interface ReadOddsQuote extends NormalizedOddsQuote {
  /** Data supplier is independent of the canonical bookmaker identity. */
  provider?:string; providerPriority?:number;
  quoteId: string;
  freshnessTtlMinutes?: number | null;
  fixtureId: string; bookmakerId: string; bookmakerName: string;
  /** Legacy field name: verified feed/content eligibility, never visitor affiliate permission. */
  geoEligible: boolean;
  persistedAt: string; lastSuccessfulRefreshAt: string; providerKickoff: string;
}
export interface OddsReadSnapshot { quotes: ReadOddsQuote[]; kickoff: string; fixtureStatus: string; approvedNativeProviders?:readonly string[];
  fixtureId?:string;
  /** Separate informational channel. NEVER passed as executable/local quotes. */
  referenceQuotes?:Array<ReadOddsQuote&{sourceGeo:string;providerBookmakerId:string;targetGeo:string}>;
  /** Server-selected target pool; an explicit empty array must never expand to legacy BR cards. */
  eligibleBookmakers?:readonly {id:string;name:string;priority:number}[];
  /**
   * This jurisdiction's configured reference pool. Each entry becomes its own explicitly attributed
   * row so market continuity never requires moving a price into a primary book's identity. Omitted or
   * empty means no reference source is configured, which is the state of every GEO today.
   */
  fallbackBookmakers?:readonly {id:string;name:string;priority:number}[];
  insuranceEnabled?:boolean;
}
export interface OddsCell {
  outcome: OddsOutcome; decimalOdds: string | null; state: OddsStatus | 'UNAVAILABLE'; best: boolean; expiresAt: string | null;
  priceKind: 'REAL' | 'PROXY' | null;
  targetBookmaker: string;
  sourceBookmaker: string | null;
  sourceBookmakerName: string | null;
  sourceQuoteId: string | null;
  sourceObservedAt: string | null;
}
export interface OddsBookmakerRow { bookmaker: string; name: string; cells: OddsCell[]; action: string | null;
  /** Absent means PRIMARY_VISIBLE, which is what every row was before reference rows existed. */
  role?: PoolRole;
  /** False on every reference row: a reference price is never a commercial destination. */
  affiliateEligible?: boolean;
}
export interface OddsComparison {
  references?:IndicativeQuote[];
  market: OddsMarket; line: number | null; rows: OddsBookmakerRow[];
  observedAt: string | null; providerUpdatedAt: string | null; expiresAt: string | null; closesAt?: string | null; eligiblePrices: number;
}
export interface IndicativeQuote {
  kind:'INDICATIVE';fixtureId:string;providerFixtureId:string;market:OddsMarket;outcome:OddsOutcome;line:number|null;
  scope:'FULL_TIME_REGULATION';phase:'PREGAME';decimalOdds:string;bookmaker:string;bookmakerName:string;
  sourceGeo:string;sourceDomain:string;quoteId:string;observedAt:string;providerUpdatedAt:string;expiresAt:string;
  affiliateEligible:false;executable:false;
}
