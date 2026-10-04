'use client';
import {useCommercialOffer} from '@/affiliate/client';
import type {CommercialContext} from '@/affiliate/types';
import {SponsoredCreative} from './SponsoredCreative';
export function SponsoredSlot({context,copyLocale}:{context:CommercialContext;copyLocale?:'br'|'mx'|'co'|'pe'|'en'}){
  // Signed, country-bound offers never enter the public HTML/ISR cache. The existing
  // private offer endpoint rechecks physical GEO, owner preview and campaign approval.
  const offer=useCommercialOffer(context);return offer?.creative?<SponsoredCreative key={offer.token} offer={offer} locale={copyLocale??context.locale}/>:null;
}
