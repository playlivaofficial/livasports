import {renderOffer} from '@/affiliate/render';
import type {CommercialContext} from '@/affiliate/types';
import {SponsorCreative} from './SponsorCreative';
export async function SponsoredSlot({context}:{context:CommercialContext}){
  const offer=await renderOffer(context);return offer?.creative?<SponsorCreative key={offer.token} offer={offer} locale={context.locale}/>:null;
}
