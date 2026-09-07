import type { MarketCode, OutcomeCode, FixtureStatus } from '@/domain/enums';
import type { PageKey, SiteLocale } from '@/config/i18n';

export type FreshnessState = 'fresh' | 'stale' | 'unavailable';
export type ProviderDeliveryState = 'available' | 'partial' | 'unavailable' | 'not-configured';
export interface ProviderState { state: ProviderDeliveryState; freshness: FreshnessState; reason: 'ok' | 'no-data' | 'credentials-missing' | 'provider-error' | 'partial-coverage'; }
export interface BookmakerPriceView { bookmaker: 'Betano BR' | 'Betsson'; decimalOdds: number; providerUpdatedAt: string; freshness: Exclude<FreshnessState, 'unavailable'>; }
export interface OutcomeOddsView { outcome: OutcomeCode; prices: BookmakerPriceView[]; }
export interface MarketOddsView { market: MarketCode; line: number | null; outcomes: OutcomeOddsView[]; }
export interface FixtureView {
  id: string; competition: string; homeTeam: string; awayTeam: string; kickoff: string; status: FixtureStatus;
  competitionSlug?: string; competitionGroup?: string; competitionPriority?: number;
  homeTeamShortName?: string | null; awayTeamShortName?: string | null; homeTeamImageUrl?: string | null; awayTeamImageUrl?: string | null;
  homeScore: number | null; awayScore: number | null; freshness: FreshnessState; odds: MarketOddsView[];
  oddsState: 'complete' | 'partial' | 'none' | 'stale' | 'unavailable';
}
export interface CompetitionSectionView { competition: string; slug: string; group: string; priority: number; fixtures: FixtureView[]; }
export interface M2PageData {
  locale: SiteLocale; page: PageKey; currentDate: string; timeZone: string; sportsData: ProviderState; oddsData: ProviderState;
  competitions: string[]; sections: CompetitionSectionView[]; paidOddsRequests: number;
}
