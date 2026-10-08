import type { MarketCode, OutcomeCode, FixtureStatus } from '@/domain/enums';
import type { PageKey, SiteLocale } from '@/config/i18n';

export type FreshnessState = 'fresh' | 'stale' | 'unavailable';
export type ProviderDeliveryState = 'available' | 'partial' | 'unavailable' | 'not-configured';
export interface ProviderState { state: ProviderDeliveryState; freshness: FreshnessState; reason: 'ok' | 'no-data' | 'credentials-missing' | 'provider-error' | 'partial-coverage'; }
export interface BookmakerPriceView {
  bookmaker: string; decimalOdds: number; providerUpdatedAt: string; freshness: Exclude<FreshnessState, 'unavailable'>; expiresAt?: string;
  priceKind?: 'REAL' | 'PROXY';
  targetBookmaker?: string;
  sourceBookmaker?: string;
  sourceBookmakerName?: string;
  sourceQuoteId?: string;
  sourceObservedAt?: string;
}
export interface OutcomeOddsView { outcome: OutcomeCode; prices: BookmakerPriceView[]; }
export interface MarketOddsView { market: MarketCode; line: number | null; outcomes: OutcomeOddsView[]; }
export interface FixtureView {
  referenceOdds?:import('@/odds/types').IndicativeQuote[];
  id: string; publicId?: string; competition: string; homeTeam: string; awayTeam: string; kickoff: string; status: FixtureStatus;
  competitionSlug?: string; competitionGroup?: string; competitionPriority?: number;
  homeTeamShortName?: string | null; awayTeamShortName?: string | null; homeTeamImageUrl?: string | null; awayTeamImageUrl?: string | null;
  homeScore: number | null; awayScore: number | null; freshness: FreshnessState; odds: MarketOddsView[];
  oddsState: 'complete' | 'partial' | 'none' | 'stale' | 'unavailable';
  /** 1–5 when this fixture is in the product GEO's active Growth Top 5. */
  growthRank?: number;
}
export interface CompetitionView { competition: string; slug: string; group: string; priority: number; }
export interface CompetitionSectionView extends CompetitionView { fixtures: FixtureView[]; }
export interface M2PageData {
  locale: SiteLocale; page: PageKey; currentDate: string; timeZone: string; sportsData: ProviderState; oddsData: ProviderState;
  competitions: string[]; sections: CompetitionSectionView[]; paidOddsRequests: number;
}
