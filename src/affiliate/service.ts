import 'server-only';
import {randomUUID} from 'node:crypto';
import type {QueryExecutor} from '@/database/client';
import {readSlipComparison,readPublicOddsFixtures} from '@/odds/read-repository';
import {buildSlipComparison} from '@/slip/comparison';
import {buildComparison} from '@/odds/comparison';
import {campaignDestination,isSlipPlacement,isSponsorPlacement,validCreative} from './policy';
import {readCampaigns,readPageContext} from './repository';
import {signOffer} from './tokens';
import {isPublisherEmbed,type Campaign,type CommercialContext,type Creative,type PageContext,type PublicOffer,type VerifiedOffer} from './types';
import type {SiteLocale} from '@/config/i18n';
import {commercialGeoFromLocale} from '@/odds/commercial-geo';

export interface OfferDependencies {
  campaigns(locale:SiteLocale):Promise<Campaign[]>;
  page(context:CommercialContext):Promise<PageContext|null>;
  pricing(context:CommercialContext,bookmaker:string,now:number):Promise<number|null>;
}
export function offerDependencies(db:QueryExecutor):OfferDependencies{return {
  campaigns:locale=>readCampaigns(db,locale),page:context=>readPageContext(db,context),
  pricing:async(context,bookmaker,now)=>{
    if(isSlipPlacement(context.placement)){
      const selections=context.selections!,data=await readSlipComparison(db,[...new Set(selections.map(s=>s.fixturePublicId))],commercialGeoFromLocale(context.locale));
      const b=buildSlipComparison(selections,context.locale,data.fixtures,data.bookmakers,now).bookmakers.find(b=>b.bookmakerId===bookmaker);
      return b?.complete?Math.min(...b.selectionQuotes.map(q=>Date.parse(q.expiresAt!))):null;
    }
    const fixture=(await readPublicOddsFixtures(db,[context.fixturePublicId!],commercialGeoFromLocale(context.locale))).get(context.fixturePublicId!);if(!fixture)return null;
    const b=buildComparison(fixture.snapshot,context.market!,now).rows.find(b=>b.bookmaker===bookmaker);
    const prices=b?.cells.filter(c=>c.decimalOdds&&c.expiresAt)??[];return prices.length?Math.min(...prices.map(c=>Date.parse(c.expiresAt!))):null;
  },
};}
export async function resolveOffer(context:CommercialContext,deps:OfferDependencies,now=Date.now(),expectedCampaign?:string,expectedVersion?:number):Promise<VerifiedOffer|null>{
  const candidates=(await deps.campaigns(context.locale)).filter(c=>campaignDestination(c,context,now));
  const eligible=candidates.flatMap<{campaign:Campaign;creative:Creative|null}>(c=>{
    if(!isSponsorPlacement(context.placement))return [{campaign:c,creative:null}];
    const creatives=c.creatives.filter(s=>validCreative(s,context,now,c.operatorCampaignId,c.bookmaker));return creatives.length===1?[{campaign:c,creative:creatives[0]}]:[];
  });
  // Ambiguous commercial configuration fails closed; no commission-based choice.
  if(eligible.length!==1)return null;const {campaign,creative}=eligible[0];if(expectedCampaign&&campaign.id!==expectedCampaign)return null;
  if(expectedCampaign&&campaign.commercialVersion!==undefined&&campaign.commercialVersion!==expectedVersion)return null;
  const page=await deps.page(context);if(!page)return null;
  let expiresAt=Math.min(now+300000,Date.parse(campaign.endsAt),creative?.endsAt?Date.parse(creative.endsAt):Infinity);
  if(!isSponsorPlacement(context.placement)){const priceExpiry=await deps.pricing(context,campaign.bookmaker,now);if(priceExpiry===null||priceExpiry<=now)return null;expiresAt=Math.min(expiresAt,priceExpiry);}
  return {campaign,context:{...context,bookmaker:campaign.bookmaker},page,expiresAt,creative};
}
export function publicOffer(offer:VerifiedOffer,key:string,now=Date.now(),embedPermission?:'anonymous'|'consent',qaSession?:string):PublicOffer{
  if(isPublisherEmbed(offer.creative?.delivery)&&!embedPermission)throw Error('EMBED_PRIVACY_PERMISSION_REQUIRED');
  const token=signOffer({v:1,viewId:randomUUID(),campaignId:offer.campaign.id,...(offer.campaign.commercialVersion!==undefined?{campaignVersion:offer.campaign.commercialVersion}:{}),context:offer.context,expiresAt:offer.expiresAt,...(qaSession?{qaSession}:{}),...(isPublisherEmbed(offer.creative?.delivery)?{embedPermission}:{})},key);
  const c=offer.creative;return {campaignId:offer.campaign.id,bookmaker:offer.campaign.bookmaker,placement:offer.context.placement,...(qaSession?{qaPreview:true}:{}),
    analytics:{fixturePublicId:offer.context.fixturePublicId??(/\/(jogo|partido|match)\//.test(offer.context.pagePath)?offer.context.pagePath.slice(-16):undefined),competitionSlug:offer.context.competitionSlug,
      market:offer.context.market,slipLegCount:offer.context.selections?.length??(offer.context.market?1:undefined)},
    href:`/go/${offer.campaign.bookmaker}/${offer.context.placement}?offer=${token}`,token,expiresAt:new Date(offer.expiresAt).toISOString(),resolvedAt:new Date(now).toISOString(),
    destinationType:offer.campaign.destinationType,...(isPublisherEmbed(c?.delivery)?{embedPermission}:{}),creative:c?{id:c.id,placement:c.placement,locale:c.locale,imageUrl:c.imageUrl,imageAlt:c.imageAlt,width:c.width,height:c.height,...(isPublisherEmbed(c.delivery)?{delivery:c.delivery}:{})}:null};
}
