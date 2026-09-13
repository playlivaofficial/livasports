import type {SiteLocale} from '@/config/i18n';
import type {CanonicalSelection} from '@/slip/types';
import type {OddsMarket} from '@/odds/types';

export const placements=['match_odds_table','match_slip_comparison','match_right_rail','match_top_banner','match_inline',
  'team_top_leaderboard','team_right_rail','team_inline','player_top_leaderboard','player_right_rail','player_inline',
  'slip_bookmaker_comparison','home_top_banner','home_right_rail','competition_inline','mobile_inline','profile_mobile_inline'] as const;
export type Placement=typeof placements[number];
export type Bookmaker='betsson'|'betano.bet.br';
export type DestinationType='HOMEPAGE'|'SPORTSBOOK';
export type PageType='HOME'|'MATCH'|'TEAM'|'PLAYER'|'COMPETITION';
export interface CommercialContext {
  locale:SiteLocale;pagePath:string;placement:Placement;bookmaker?:Bookmaker;
  fixturePublicId?:string;market?:OddsMarket;selections?:CanonicalSelection[];competitionSlug?:string;
}
export interface Creative {id:string;placement:Placement;locale:SiteLocale;imageUrl:string|null;imageAlt:string;width:number;height:number;approved:boolean;enabled:boolean;startsAt:string|null;endsAt:string|null;delivery?:'IMAGE'|'BETSSON_EMBED';embedSourceUrl?:string|null;}
export interface Campaign {
  id:string;operatorCampaignId:string;linkId:string;bookmaker:Bookmaker;locale:SiteLocale;enabled:boolean;approved:boolean;
  geoEligible:boolean;affiliateApproved:boolean;destination:string|null;destinationType:DestinationType;
  placements:Placement[];domains:string[];startsAt:string;endsAt:string;creatives:Creative[];
}
export interface PageContext {pageType:PageType;pagePath:string;fixtureId?:string;teamId?:string;playerId?:string;competitionId?:string;}
export interface VerifiedOffer {campaign:Campaign;context:CommercialContext;page:PageContext;expiresAt:number;creative:Creative|null;}
export interface PublicOffer {qaPreview?:boolean;bookmaker:Bookmaker;placement:Placement;href:string;token:string;expiresAt:string;resolvedAt:string;destinationType:DestinationType;embedPermission?:'anonymous'|'consent';creative:Omit<Creative,'approved'|'enabled'|'startsAt'|'endsAt'|'embedSourceUrl'>|null;}
export interface OfferToken {qaSession?:string;v:1;viewId:string;campaignId:string;context:CommercialContext;expiresAt:number;embedPermission?:'anonymous'|'consent';}
export type TrafficClass='HUMAN_CLICK'|'HUMAN_VIEW'|'QA_TEST'|'UNKNOWN';
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
