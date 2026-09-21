import type {SiteLocale} from '@/config/i18n';
import type {CanonicalSelection,ResolvedSelection,SelectionState,SlipResolution} from './types';

export type ComparisonState='EMPTY_SLIP'|'ONE_SELECTION'|'MULTI_SELECTION_NO_BOOKMAKER'|'ONE_COMPLETE_BOOKMAKER'|'MULTIPLE_COMPLETE_BOOKMAKERS'|'PARTIAL_BOOKMAKER_COVERAGE'|'STALE_SELECTION'|'MATCH_STARTED'|'MISSING_SELECTION_PRICE'|'MIXED_VALIDITY';
export type OutboundCapability='NONE'|'HOMEPAGE'|'SPORTSBOOK'|'MARKET_DEEPLINK'|'PREFILLED_SLIP';
/** Safe server/QA codes. Never shown as raw strings in the UI. */
export type ComparisonDiagnostic='COMPLETE'|'PROXY_QUOTE'|'MISSING_QUOTE'|'STALE_QUOTE'|'WITHDRAWN'|'MARKET_MISSING'|'FIXTURE_MISSING'|'MATCH_STARTED'|'MATCH_FINISHED'|'INVALID_QUOTE'|'SNAPSHOT_INCOMPATIBLE';
export type BookmakerAvailabilityState='COMPLETE'|'ESTIMATED_COMPLETE'|'MISSING_LEG'|'STALE_LEG'|'WITHDRAWN_LEG'|'MARKET_UNAVAILABLE'|'FIXTURE_UNAVAILABLE'|'QUOTE_REPRICED'|'BOOKMAKER_NOT_ELIGIBLE_FOR_CTA'|'OTHER_VERIFIED_UNAVAILABLE_REASON';
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
  diagnosticCode:ComparisonDiagnostic;
  decimalOdds:string|null;
  expiresAt:string|null;
  closesAt:string|null;
  priceKind:'REAL'|'PROXY'|null;
  sourceBookmakerId:string|null;
  sourceBookmakerName:string|null;
  sourceQuoteId:string|null;
  sourceObservedAt:string|null;
}
export interface BookmakerSlip extends BookmakerConfig {
  priceClassification:'REAL_COMPLETE'|'ESTIMATED_COMPLETE'|'INCOMPLETE';
  requiredSelectionCount:number;
  availableSelectionCount:number;
  realSelectionCount:number;
  proxySelectionCount:number;
  missingSelections:SelectionQuote[];
  invalidSelections:SelectionQuote[];
  complete:boolean;
  estimated:boolean;
  availabilityState:BookmakerAvailabilityState;
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
  generatedAt:string;
}
export interface FullSlipResolution extends SlipResolution {comparison:SlipComparison;}
