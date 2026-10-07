import type {EmbedDelivery,Placement} from './types';
import {ONE_XBET_PE_CREATIVES,oneXBetMediaId,safeBetssonEmbed} from './embed-policy';
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

interface InventoryCreative {mediaId:string;width:number;height:number}
interface InventoryEntry {promotion:string;delivery:EmbedDelivery;roles:Readonly<Record<CreativeRole,readonly InventoryCreative[]>>}
const PE_1XBET=ONE_XBET_PE_CREATIVES['178222'];

/**
 * An empty role list means the jurisdiction deliberately gives that slot to another operator. Peru is
 * split: 1xBet holds the top banner and the mobile slot, Inkabet the desktop right rail. Nothing
 * shares a placement, because resolveOffer fails closed when two campaigns match one slot.
 */
const INVENTORY:Readonly<Record<string,InventoryEntry>>={
  'betsson:mx':{promotion:'Studio_71340 - Sportsbook Welcome Offer - MX',delivery:'BETSSON_EMBED',roles:{
    // 970x90 is preferred; 728x90 is the approved fallback for the same promotion.
    top:[{mediaId:'207553',width:970,height:90},{mediaId:'207551',width:728,height:90}],
    right:[{mediaId:'207557',width:300,height:250}],
    mobile:[{mediaId:'207552',width:320,height:50}]}},
  // Colombia and Peru publish no 970x90 for these promotions, so 728x90 is the desktop top.
  'betsson:co':{promotion:'Studio_71342 - Sportsbook Welcome Offer - CO',delivery:'BETSSON_EMBED',roles:{
    top:[{mediaId:'209366',width:728,height:90}],
    right:[{mediaId:'207980',width:300,height:250}],
    mobile:[{mediaId:'207978',width:320,height:50}]}},
  // Inkabet keeps the Peru desktop right rail only. Its 728x90 (208590) and 320x50 (208595) remain
  // approved creatives on the platform but are not placed here, so they cannot collide with 1xBet.
  'inkabet:pe':{promotion:'Studio_Sportsbook Welcome Offer Update - INKABET',delivery:'BETSSON_EMBED',roles:{
    top:[],
    right:[{mediaId:'208596',width:300,height:250}],
    mobile:[]}},
  // 1xBet Peru ships one approved creative, 320x50 (178222), as a partner iframe rather than a
  // Bannerflow script. It serves both the desktop top banner — compact and centred at native size —
  // and the mobile slot, which is a native 320x50 placement. 1xBet publishes no right-rail size for
  // this promotion, so the Peru right rail stays with Inkabet.
  '1xbet:pe':{promotion:'WELCOME BONUS_PERU_2025',delivery:'ONE_XBET_IFRAME',roles:{
    top:[{mediaId:'178222',...PE_1XBET}],
    right:[],
    mobile:[{mediaId:'178222',...PE_1XBET}]}},
};

export function creativePromotion(operator:string,locale:string):string|null{return INVENTORY[`${operator}:${locale}`]?.promotion??null;}
/** The delivery this operator/GEO's platform generates, or null when it has no approved inventory. */
export function inventoryDelivery(operator:string,locale:string):EmbedDelivery|null{return INVENTORY[`${operator}:${locale}`]?.delivery??null;}

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
 * its platform's own delivery contract. Operators without an inventory, such as bwin Colombia, resolve
 * nothing, and a role left empty for a jurisdiction resolves nothing either.
 */
export function inventoryCreative(operator:string,locale:string,role:CreativeRole,embedSourceUrl:unknown):(InventoryCreative&{delivery:EmbedDelivery})|null{
  const entry=INVENTORY[`${operator}:${locale}`];
  if(!entry||typeof embedSourceUrl!=='string')return null;
  const media=entry.delivery==='ONE_XBET_IFRAME'?oneXBetMediaId(embedSourceUrl,operator,locale):bannerflowMediaId(operator,locale,embedSourceUrl);
  if(!media)return null;
  const item=entry.roles[role].find(item=>item.mediaId===media);
  return item?{...item,delivery:entry.delivery}:null;
}

/** Neutral accessible description: names the operator and the responsible-gambling notice only. */
export function creativeAlt(operator:string):string{
  const brand=operator==='inkabet'?'Inkabet':operator==='1xbet'?'1xBet':'Betsson';
  return `${brand}: apuestas deportivas. Solo para mayores de 18 años. Juega con responsabilidad.`;
}
