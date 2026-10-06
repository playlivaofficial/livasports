import 'server-only';
import {previewBinding} from '@/owner/session';
import {cache} from 'react';
import {headers} from 'next/headers';
import {analyticsAllowed,geoAllowed} from './policy';
import {signingKey} from './tokens';
import {affiliateDatabase} from './runtime';
import {readCampaigns,readPageContext} from './repository';
import {publicOffer,resolveOffer,offerDependencies} from './service';
import {isPublisherEmbed,type CommercialContext} from './types';
import type {SiteLocale} from '@/config/i18n';
const campaigns=cache((locale:SiteLocale)=>readCampaigns(affiliateDatabase(),locale));
const page=cache((locale:SiteLocale,pagePath:string,competitionSlug?:string)=>readPageContext(affiliateDatabase(),{locale,pagePath,placement:competitionSlug?'competition_inline':'mobile_inline',...(competitionSlug?{competitionSlug}:{})}));
export async function renderOffer(context:CommercialContext){
  try{const key=signingKey();if(!key)return null;const h=await headers(),request=new Request('https://livasports.com',{headers:h});
    if(!geoAllowed(request,context.locale))return null;
    const offer=await resolveOffer(context,{...offerDependencies(affiliateDatabase()),campaigns,page:c=>page(c.locale,c.pagePath,c.competitionSlug)});
    if(isPublisherEmbed(offer?.creative?.delivery)&&!analyticsAllowed(request))return null;
    return offer?publicOffer(offer,key,Date.now(),process.env.AFFILIATE_ANALYTICS_MODE==='consent'?'consent':'anonymous',previewBinding(h)):null;
  }catch{return null;}
}
