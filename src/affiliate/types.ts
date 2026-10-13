import type {SiteLocale} from '@/config/i18n';
import type {CanonicalSelection} from '@/slip/types';
import type {OddsMarket} from '@/odds/types';
import type {BookmakerId} from '@/odds/registry';

export const placements=['match_odds_table','match_slip_comparison','match_right_rail','match_top_banner','match_inline',
  'team_top_leaderboard','team_right_rail','team_inline','player_top_leaderboard','player_right_rail','player_inline',
  'slip_bookmaker_comparison','home_top_banner','home_right_rail','competition_inline','mobile_inline','profile_mobile_inline'] as const;
export type Placement=typeof placements[number];
export type Bookmaker=BookmakerId;
export type DestinationType='HOMEPAGE'|'SPORTSBOOK';
export type PageType='HOME'|'MATCH'|'TEAM'|'PLAYER'|'COMPETITION';
export interface CommercialContext {
  locale:SiteLocale;pagePath:string;placement:Placement;bookmaker?:Bookmaker;
  /**
   * 'logo' marks the bookmaker's own logo on an odds board or slip comparison. The logo is a brand
   * link to the operator's approved campaign destination, so unlike a price CTA it does not require
   * that bookmaker to hold a current price. It is part of the signed context, so a token minted for
   * a logo can only ever be redeemed as a logo.
   */
  // A slip 'visit' is also ordinary sportsbook navigation, not a price-specific bet placement.
  cta?:'logo'|'visit';
  fixturePublicId?:string;market?:OddsMarket;selections?:CanonicalSelection[];competitionSlug?:string;slipId?:string;
}
/**
 * How a creative reaches the page. IMAGE is a locally hosted asset inside a first-party anchor.
 * BETSSON_EMBED is the Bannerflow publisher script, ONE_XBET_IFRAME the 1xBet Peru partner iframe and
 * ENTAIN_IFRAME the Entain Partners zone iframe for bwin Colombia. All three run only inside the
 * sandboxed credentialless publisher document, so all three are privacy-gated.
 */
export type CreativeDelivery='IMAGE'|'BETSSON_EMBED'|'ONE_XBET_IFRAME'|'ENTAIN_IFRAME';
export type EmbedDelivery=Exclude<CreativeDelivery,'IMAGE'>;
/** A third-party publisher delivery: never a plain image, always consent-gated and sandboxed. */
export function isPublisherEmbed(delivery:string|undefined|null):delivery is EmbedDelivery{return delivery==='BETSSON_EMBED'||isPartnerIframe(delivery);}
/** The operator's own creative iframe, nested unmodified inside the sandboxed publisher document. */
export function isPartnerIframe(delivery:string|undefined|null):delivery is 'ONE_XBET_IFRAME'|'ENTAIN_IFRAME'{return delivery==='ONE_XBET_IFRAME'||delivery==='ENTAIN_IFRAME';}
export interface Creative {id:string;placement:Placement;locale:SiteLocale;imageUrl:string|null;imageAlt:string;width:number;height:number;approved:boolean;enabled:boolean;startsAt:string|null;endsAt:string|null;delivery?:CreativeDelivery;embedSourceUrl?:string|null;}
export interface Campaign {
  operatorDomains?:string[];
  commercialVersion?:number;
  id:string;operatorCampaignId:string;linkId:string;bookmaker:Bookmaker;locale:SiteLocale;enabled:boolean;approved:boolean;
  geoEligible:boolean;affiliateApproved:boolean;destination:string|null;destinationType:DestinationType;
  placements:Placement[];domains:string[];startsAt:string;endsAt:string;creatives:Creative[];
}
export interface PageContext {pageType:PageType;pagePath:string;fixtureId?:string;teamId?:string;playerId?:string;competitionId?:string;}
export interface VerifiedOffer {campaign:Campaign;context:CommercialContext;page:PageContext;expiresAt:number;creative:Creative|null;}
export interface PublicOffer {campaignId?:string;qaPreview?:boolean;bookmaker:Bookmaker;placement:Placement;href:string;token:string;expiresAt:string;resolvedAt:string;destinationType:DestinationType;embedPermission?:'anonymous'|'consent';creative:Omit<Creative,'approved'|'enabled'|'startsAt'|'endsAt'|'embedSourceUrl'>|null;
  analytics?:{fixturePublicId?:string;competitionSlug?:string;market?:OddsMarket;slipLegCount?:number};
}
export interface OfferToken {qaSession?:string;v:1;viewId:string;campaignId:string;campaignVersion?:number;context:CommercialContext;expiresAt:number;embedPermission?:'anonymous'|'consent';}
export type TrafficClass='HUMAN_CLICK'|'HUMAN_VIEW'|'QA_TEST'|'UNKNOWN';
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
