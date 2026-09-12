import 'server-only';
import {cache} from 'react';
import {headers} from 'next/headers';
import {geoAllowed} from './policy';
import {signingKey} from './tokens';
import {affiliateDatabase} from './runtime';
import {readCampaigns,readPageContext} from './repository';
import {publicOffer,resolveOffer,offerDependencies} from './service';
import type {CommercialContext} from './types';
const campaigns=cache((locale:'br'|'mx')=>readCampaigns(affiliateDatabase(),locale));
const page=cache((locale:'br'|'mx',pagePath:string,competitionSlug?:string)=>readPageContext(affiliateDatabase(),{locale,pagePath,placement:competitionSlug?'competition_inline':'mobile_inline',...(competitionSlug?{competitionSlug}:{})}));
export async function renderOffer(context:CommercialContext){
  try{const key=signingKey();if(!key)return null;const h=await headers(),request=new Request('https://livasports.com',{headers:h});
    if(!geoAllowed(request,context.locale))return null;
    const offer=await resolveOffer(context,{...offerDependencies(affiliateDatabase()),campaigns,page:c=>page(c.locale,c.pagePath,c.competitionSlug)});return offer?publicOffer(offer,key):null;
  }catch{return null;}
}
