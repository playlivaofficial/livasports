'use client';
import {useCommercialOffer} from '@/affiliate/client';
import type {CommercialContext} from '@/affiliate/types';
import {SponsoredCreative} from './SponsoredCreative';
import {usePublicCommercialLocale} from '@/localization/PublicPresentation';
import {translatedPath} from '@/localization/interface';
export function SponsoredSlot({context,copyLocale}:{context:CommercialContext;copyLocale?:'br'|'mx'|'co'|'pe'|'en'}){
  // Signed, country-bound offers never enter the public HTML/ISR cache. The existing
  // private offer endpoint rechecks physical GEO, owner preview and campaign approval.
  const commercial=usePublicCommercialLocale();
  // Resolve the existing semantic page in the eligible jurisdiction. The UI path
  // remains a translation; signed offers still recheck GEO server-side.
  const resolved=commercial?{...context,locale:commercial,pagePath:translatedPath(context.pagePath,commercial)}:context;
  const offer=useCommercialOffer(resolved,!!commercial);return offer?.creative?<SponsoredCreative key={offer.token} offer={offer} locale={copyLocale??context.locale}/>:null;
}
