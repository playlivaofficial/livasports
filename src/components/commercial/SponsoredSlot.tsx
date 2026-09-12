import {renderOffer} from '@/affiliate/render';
import type {CommercialContext} from '@/affiliate/types';
import {SponsoredCreative} from './SponsoredCreative';
export async function SponsoredSlot({context}:{context:CommercialContext}){
  const offer=await renderOffer(context);return offer?.creative?<SponsoredCreative key={offer.token} offer={offer} locale={context.locale}/>:null;
}
