import {VISIBLE_BOOKMAKERS} from '@/odds/registry';
import {isCoreGeo,type CoreGeo} from '@/config/geo';
import type {InterfaceLocale} from '@/localization/interface';
import {v2Path} from './routes';

/** Public presentation contract. Destinations are never copied from legacy campaigns.
 * Activation requires a separately reviewed, server-authorized campaign resolver. */
export interface CommercialSlot {
  operatorId:string;countryCode:CoreGeo;operatorName:string;logoAsset:string|null;reviewPath:string;
  campaignId:string|null;offerTitle:string|null;offerTerms:{label:string;url:string}|null;
  trackingDestination:string|null;affiliateEnabled:boolean;commercialStatus:'pending_verification'|'active'|'disabled';
  placementId:string;displayPriority:number;lastVerifiedAt:string|null;paymentMethods:readonly string[];
}
export function pendingOperatorSlots(geo:unknown,locale:InterfaceLocale,placementId='v2-comparison'):CommercialSlot[]{
  if(!isCoreGeo(geo))return [];
  return VISIBLE_BOOKMAKERS.filter(book=>(book.countries as readonly string[]).includes(geo)).map(book=>({
    operatorId:book.canonicalId,countryCode:geo,operatorName:book.displayName,logoAsset:book.logoAsset,
    reviewPath:v2Path(locale,'bookmakers',book.canonicalId),campaignId:null,offerTitle:null,offerTerms:null,
    trackingDestination:null,affiliateEnabled:false,commercialStatus:'pending_verification',placementId,
    displayPriority:book.displayOrder,lastVerifiedAt:null,paymentMethods:[],
  }));
}
export const reviewIdentities=VISIBLE_BOOKMAKERS.map(book=>({id:book.canonicalId,name:book.displayName,logo:book.logoAsset}));
