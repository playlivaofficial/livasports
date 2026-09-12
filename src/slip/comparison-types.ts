import type {SiteLocale} from '@/config/i18n';
import type {CanonicalSelection,ResolvedSelection,SelectionState,SlipResolution} from './types';

export type ComparisonState='EMPTY_SLIP'|'ONE_SELECTION'|'MULTI_SELECTION_NO_BOOKMAKER'|'ONE_COMPLETE_BOOKMAKER'|'MULTIPLE_COMPLETE_BOOKMAKERS'|'PARTIAL_BOOKMAKER_COVERAGE'|'STALE_SELECTION'|'MATCH_STARTED'|'MISSING_SELECTION_PRICE'|'MIXED_VALIDITY';
export type OutboundCapability='NONE'|'HOMEPAGE'|'SPORTSBOOK'|'MARKET_DEEPLINK'|'PREFILLED_SLIP';
export interface BookmakerConfig {
  bookmakerId:string;
  displayName:string;
  geoEligibility:{locale:SiteLocale;eligible:boolean};
  affiliateEligibility:{approved:boolean;destinationConfigured:boolean;destinationType?:'HOMEPAGE'|'SPORTSBOOK'};
}
export interface SelectionQuote {
  selection:CanonicalSelection;
  fixture:ResolvedSelection['fixture'];
  state:SelectionState;
  reason:'MISSING_FIXTURE'|'NO_QUOTE'|'INVALID_QUOTE'|null;
  decimalOdds:string|null;
  expiresAt:string|null;
  closesAt:string|null;
}
export interface BookmakerSlip extends BookmakerConfig {
  requiredSelectionCount:number;
  availableSelectionCount:number;
  missingSelections:SelectionQuote[];
  invalidSelections:SelectionQuote[];
  complete:boolean;
  selectionQuotes:SelectionQuote[];
  combinedDecimalOdds:string|null;
  best:boolean;
  tiedBest:boolean;
  ctaState:'ENABLED'|'INCOMPLETE'|'AFFILIATE_UNAVAILABLE';
  outboundCapability:OutboundCapability;
}
export interface SlipComparison {
  version:1;
  locale:SiteLocale;
  states:ComparisonState[];
  bookmakers:BookmakerSlip[];
  expiresAt:string|null;
}
export interface FullSlipResolution extends SlipResolution {comparison:SlipComparison;}
