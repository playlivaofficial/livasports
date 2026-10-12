import type {EmbedDelivery,Placement} from './types';
import {ENTAIN_CO_ZONES,ONE_XBET_PE_CREATIVES,entainZoneId,oneXBetMediaId,safeBetssonEmbed} from './embed-policy';
import type {SiteLocale} from '@/config/i18n';

/**
 * Official sportsbook creatives, collected from the Betsson Group Affiliates media gallery on
 * 2026-10-05/06 and from the 1xBet Partners Peru media library on 2026-10-06. Every media id here was
 * verified against its own platform record (brand, language, product, promotion and dimensions), not
 * just a gallery search, which silently falls back to Betsson ES/Inkabet results when its filters do
 * not apply.
 *
 * This is the allowlist an owner activation is checked against: an embed is accepted only when its
 * media id appears here for the same operator and jurisdiction, in the role it is being placed in, at
 * these exact dimensions, under the delivery that operator's platform actually generates. Nothing here
 * is secret; the per-channel tokens live only in the server-side campaign and creative rows.
 */
export type CreativeRole='top'|'right'|'mobile';
export const CREATIVE_ROLES=['top','right','mobile'] as const satisfies readonly CreativeRole[];

/**
 * The previously approved sportsbook sponsor locations. Desktop gets a top banner and a right rail;
 * mobile gets the top slot only, and the stylesheet hides top/right placements below the mobile
 * breakpoint and mobile_inline above it, so no form factor can show the wrong one.
 */
export const ROLE_PLACEMENTS:Readonly<Record<CreativeRole,readonly Placement[]>>={
  top:['home_top_banner','match_top_banner'],
  right:['home_right_rail','match_right_rail'],
  mobile:['mobile_inline'],
};

/** A self-hosted IMAGE creative also names the exact first-party asset it is served from. */
interface InventoryCreative {mediaId:string;width:number;height:number;imageUrl?:string}
interface InventoryEntry {promotion:string;delivery:EmbedDelivery|'IMAGE';roles:Readonly<Record<CreativeRole,readonly InventoryCreative[]>>}
const PE_1XBET=ONE_XBET_PE_CREATIVES['178222'];
const PE_1XBET_DESKTOP=ONE_XBET_PE_CREATIVES['178238'];

/**
 * An empty role list means the jurisdiction deliberately gives that slot to another operator. Nothing
 * on desktop shares a placement, because resolveOffer fails closed when two campaigns match one slot;
 * only the single mobile slot rotates between different operators.
 *
 *  - Mexico: Betsson holds the top banner and the mobile slot, Winpot the desktop right rail. Winpot
 *    has no mobile role, so Mexico mobile stays Betsson-only.
 *  - Colombia: Betsson holds the top banner, bwin the desktop right rail, and both share mobile.
 *  - Peru: 1xBet holds the top banner and the mobile slot, Inkabet the desktop right rail.
 */
const INVENTORY:Readonly<Record<string,InventoryEntry>>={
  // Betsson's 300x250 (MX 207557, CO 207980) stay approved creatives on the platform but are no
  // longer placed, because the right rail now belongs to the jurisdiction's second operator.
  'betsson:mx':{promotion:'Studio_71340 - Sportsbook Welcome Offer - MX',delivery:'BETSSON_EMBED',roles:{
    // 970x90 is preferred; 728x90 is the approved fallback for the same promotion.
    top:[{mediaId:'207553',width:970,height:90},{mediaId:'207551',width:728,height:90}],
    right:[],
    mobile:[{mediaId:'207552',width:320,height:50}]}},
  // Colombia and Peru publish no 970x90 for these promotions, so 728x90 is the desktop top.
  'betsson:co':{promotion:'Studio_71342 - Sportsbook Welcome Offer - CO',delivery:'BETSSON_EMBED',roles:{
    top:[{mediaId:'209366',width:728,height:90}],
    right:[],
    mobile:[{mediaId:'207978',width:320,height:50}]}},
  // The Entain Partners zones generated on 2026-10-12 for the "LivaSports CO" campaign. The media id
  // is the zone id, which binds the creative to our campaign and tracker. See ENTAIN_CO_ZONES.
  'bwin:co':{promotion:'BWIN COLUMBIA SPORTS WELCOME BONUS - Risk-free bet up to 250k COP',delivery:'ENTAIN_IFRAME',roles:{
    top:[],
    right:[{mediaId:'2247630',...ENTAIN_CO_ZONES['2247630']}],
    mobile:[{mediaId:'2247631',...ENTAIN_CO_ZONES['2247631']}]}},
  // Affiliates World (Winpot's own MyAffiliates program) publishes exactly one sports banner, media 21
  // "Sports NFL Banner Gif 300x250" ("Bono gratis de MX$500"), with no football or leaderboard size.
  // Its generated code is a plain linked image, so the official GIF is served byte-for-byte from our
  // own origin inside the first-party affiliate anchor: no third-party script, frame or pixel loads.
  // Desktop right rail only; there is deliberately no mobile role.
  'winpot.mx:mx':{promotion:'Winpot Sportbook 500$ free',delivery:'IMAGE',roles:{
    top:[],
    right:[{mediaId:'21',width:300,height:250,imageUrl:'/sponsors/winpot/mx-sport-300x250.gif'}],
    mobile:[]}},
  // Inkabet keeps the Peru desktop right rail only. Its 728x90 (208590) and 320x50 (208595) remain
  // approved creatives on the platform but are not placed here, so they cannot collide with 1xBet.
  'inkabet:pe':{promotion:'Studio_Sportsbook Welcome Offer Update - INKABET',delivery:'BETSSON_EMBED',roles:{
    top:[],
    right:[{mediaId:'208596',width:300,height:250}],
    mobile:[]}},
  // The official 800x200 (178238), verified in the authenticated media library on 2026-10-08, fills
  // the desktop top. Keep 320x50 (178222) as the mobile creative and legacy desktop fallback during
  // activation. The Peru right rail stays with Inkabet; no native creative is enlarged or distorted.
  '1xbet:pe':{promotion:'WELCOME BONUS_PERU_2025',delivery:'ONE_XBET_IFRAME',roles:{
    top:[{mediaId:'178238',...PE_1XBET_DESKTOP},{mediaId:'178222',...PE_1XBET}],
    right:[],
    mobile:[{mediaId:'178222',...PE_1XBET}]}},
};

export function creativePromotion(operator:string,locale:string):string|null{return INVENTORY[`${operator}:${locale}`]?.promotion??null;}
/** The delivery this operator/GEO's platform generates, or null when it has no approved inventory. */
export function inventoryDelivery(operator:string,locale:string):EmbedDelivery|'IMAGE'|null{return INVENTORY[`${operator}:${locale}`]?.delivery??null;}

/**
 * The media id a Bannerflow publisher tag names, accepted only when the whole tag satisfies the
 * delivery contract: the c.bannerflow.net origin and path shape, image mode, exactly the seven
 * expected parameters, and a `redirecturl` on this operator and jurisdiction's own tracking host.
 *
 * The gallery emits `redirecturl` unencoded, so `media` and `campaign` are parameters of the
 * Bannerflow URL rather than of the redirect, and the redirect itself is just
 * `https://<tracking host>/<channel token>/<campaign>/`. An earlier revision required the redirect to
 * repeat the media id, which no real generated tag does, so every genuine creative was refused.
 */
function bannerflowMediaId(operator:string,locale:string,embedSourceUrl:string):string|null{
  let media:string|null,campaign:string|null;
  try{const url=new URL(embedSourceUrl);media=url.searchParams.get('media');campaign=url.searchParams.get('campaign');}catch{return null;}
  if(!media||!campaign)return null;
  // safeBetssonEmbed pins the campaign the tag declares, so it is passed the tag's own campaign: this
  // asserts the tag is internally consistent and correctly hosted, not that it belongs to another one.
  return safeBetssonEmbed(embedSourceUrl,campaign,operator,locale as SiteLocale)?media:null;
}

/**
 * Resolves an embed to its inventory entry and delivery, or null. The embed must name an approved media
 * id for this operator, jurisdiction and role, at the exact dimensions recorded here, and must satisfy
 * its platform's own delivery contract. Operators without an inventory resolve nothing, and a role
 * left empty for a jurisdiction resolves nothing either.
 *
 * A self-hosted IMAGE creative has no third-party URL to validate, so it is named by its media id
 * alone; the asset path then comes from this inventory, never from the request.
 */
export function inventoryCreative(operator:string,locale:string,role:CreativeRole,embedSourceUrl:unknown):(InventoryCreative&{delivery:EmbedDelivery|'IMAGE'})|null{
  const entry=INVENTORY[`${operator}:${locale}`];
  if(!entry||typeof embedSourceUrl!=='string')return null;
  const media=entry.delivery==='IMAGE'?(/^\d{1,10}$/.test(embedSourceUrl)?embedSourceUrl:null)
    :entry.delivery==='ONE_XBET_IFRAME'?oneXBetMediaId(embedSourceUrl,operator,locale)
    :entry.delivery==='ENTAIN_IFRAME'?entainZoneId(embedSourceUrl,operator,locale)
    :bannerflowMediaId(operator,locale,embedSourceUrl);
  if(!media)return null;
  const item=entry.roles[role].find(item=>item.mediaId===media);
  return item?{...item,delivery:entry.delivery}:null;
}

const BRANDS:Readonly<Record<string,string>>={inkabet:'Inkabet','1xbet':'1xBet',bwin:'bwin','winpot.mx':'Winpot'};
/** Neutral accessible description: names the operator and the responsible-gambling notice only. */
export function creativeAlt(operator:string):string{
  return `${BRANDS[operator]??'Betsson'}: apuestas deportivas. Solo para mayores de 18 años. Juega con responsabilidad.`;
}
