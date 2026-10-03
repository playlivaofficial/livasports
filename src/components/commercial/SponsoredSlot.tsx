import {renderOffer} from '@/affiliate/render';
import type {CommercialContext} from '@/affiliate/types';
import {SponsoredCreative} from './SponsoredCreative';
export async function SponsoredSlot({context,copyLocale}:{context:CommercialContext;copyLocale?:'br'|'mx'|'co'|'pe'|'en'}){
  const offer=await renderOffer(context);return offer?.creative?<SponsoredCreative key={offer.token} offer={offer} locale={copyLocale??context.locale}/>:null;
}
