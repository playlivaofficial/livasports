import type {Placement} from './types';
import {embedTrackingHost} from './embed-policy';

/**
 * Official sportsbook creatives, collected from the Betsson Group Affiliates media gallery on
 * 2026-10-05/06. Every media id here was verified against its own platform preview record (brand,
 * language, product, promotion and dimensions), not just the gallery search, which silently falls
 * back to Betsson ES/Inkabet results when its filters do not apply.
 *
 * This is the allowlist an owner activation is checked against: an embed is accepted only when its
 * media id appears here for the same operator and jurisdiction, in the role it is being placed in, at
 * these exact dimensions. Nothing here is secret; the per-GEO channel tokens live only in the
 * server-side campaign and creative rows.
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
interface InventoryEntry {promotion:string;roles:Readonly<Record<CreativeRole,readonly InventoryCreative[]>>}

const INVENTORY:Readonly<Record<string,InventoryEntry>>={
  'betsson:mx':{promotion:'Studio_71340 - Sportsbook Welcome Offer - MX',roles:{
    // 970x90 is preferred; 728x90 is the approved fallback for the same promotion.
    top:[{mediaId:'207553',width:970,height:90},{mediaId:'207551',width:728,height:90}],
    right:[{mediaId:'207557',width:300,height:250}],
    mobile:[{mediaId:'207552',width:320,height:50}]}},
  // Colombia and Peru publish no 970x90 for these promotions, so 728x90 is the desktop top.
  'betsson:co':{promotion:'Studio_71342 - Sportsbook Welcome Offer - CO',roles:{
    top:[{mediaId:'209366',width:728,height:90}],
    right:[{mediaId:'207980',width:300,height:250}],
    mobile:[{mediaId:'207978',width:320,height:50}]}},
  'inkabet:pe':{promotion:'Studio_Sportsbook Welcome Offer Update - INKABET',roles:{
    top:[{mediaId:'208590',width:728,height:90}],
    right:[{mediaId:'208596',width:300,height:250}],
    mobile:[{mediaId:'208595',width:320,height:50}]}},
};

export function creativePromotion(operator:string,locale:string):string|null{return INVENTORY[`${operator}:${locale}`]?.promotion??null;}

/**
 * Resolves an embed to its inventory entry, or null. The embed must name an approved media id for
 * this operator, jurisdiction and role, and its tracking redirect must point at the same media — the
 * platform tag carries the id twice, and a mismatch means it was edited after it was generated.
 * Operators without an inventory, such as bwin Colombia, resolve nothing.
 */
export function inventoryCreative(operator:string,locale:string,role:CreativeRole,embedSourceUrl:unknown):InventoryCreative|null{
  const entry=INVENTORY[`${operator}:${locale}`];
  if(!entry||!embedTrackingHost(operator,locale)||typeof embedSourceUrl!=='string')return null;
  let media:string|null,redirect:string|null;
  try{const url=new URL(embedSourceUrl);media=url.searchParams.get('media');redirect=url.searchParams.get('redirecturl');}catch{return null;}
  if(!media||!redirect||(redirect.match(/[?&]media=(\d+)/)?.[1]??null)!==media)return null;
  return entry.roles[role].find(item=>item.mediaId===media)??null;
}

/** Neutral accessible description: names the operator and the responsible-gambling notice only. */
export function creativeAlt(operator:string):string{
  const brand=operator==='inkabet'?'Inkabet':'Betsson';
  return `${brand}: apuestas deportivas. Solo para mayores de 18 años. Juega con responsabilidad.`;
}
