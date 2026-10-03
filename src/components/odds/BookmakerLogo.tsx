'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {bookmakerConfig,isVisibleBookmaker} from '@/odds/registry';
import {AffiliateAnchor} from '@/components/commercial/AffiliateLink';
import {useCommercialOffer} from '@/affiliate/client';
import type {CommercialContext} from '@/affiliate/types';
import {translatedPath} from '@/localization/interface';
import {track} from '@/analytics/client';

/** Inactive identities stay visible. Only a server-verified signed offer ever becomes a link. */
export function BookmakerLogo({bookmaker,context,uiLocale='en',sources=[]}:{bookmaker:string;context?:Omit<CommercialContext,'pagePath'>&{pagePath?:string};uiLocale?:'br'|'mx'|'co'|'pe'|'en';sources?:readonly {priceKind:'REAL'|'PROXY'|null}[]}){
  const book=bookmakerConfig(bookmaker),ref=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
  const pathname=usePathname()??'';
  useEffect(()=>{const node=ref.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{threshold:.5});observer.observe(node);return()=>observer.disconnect();},[]);
  const pagePath=context?.pagePath??(context?.locale&&pathname.startsWith('/en')?translatedPath(pathname,context.locale):pathname);
  const resolved=useCommercialOffer({...context,locale:context?.locale??'mx',placement:context?.placement??'match_odds_table',pagePath},visible&&!!context&&isVisibleBookmaker(bookmaker));
  const offer=visible&&context?resolved:null;
  const priceKind=sources.some(s=>s.priceKind==='PROXY')?'PROXY':sources.some(s=>s.priceKind==='REAL')?'REAL':undefined;
  useEffect(()=>{if(visible&&book&&isVisibleBookmaker(bookmaker))track('bookmaker_logo_viewed',{bookmaker:book.canonicalId,priceKind,placement:context?.placement,campaignId:offer?.campaignId},{dedupeKey:`logo:${pagePath}:${bookmaker}:${context?.fixturePublicId??'slip'}:${offer?'active':'gated'}`,props:{affiliateEnabled:!!offer}});},[visible,book,bookmaker,context?.placement,context?.fixturePublicId,pagePath,offer,priceKind]);
  if(!book||!isVisibleBookmaker(bookmaker))return null;
  const artwork=<span className={`bookmaker-logo-art bookmaker-logo-${book.canonicalId.split('.')[0]}`}>
    {book.logoAsset&&!failed?/* Optimized local identity asset already sized for DPR3. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={book.logoAsset} alt={book.shortLabel} width={88} height={22} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span>{book.shortLabel}</span>}
  </span>;
  return <span className="bookmaker-logo" ref={ref} data-bookmaker-logo={book.canonicalId} data-affiliate-enabled={!!offer}>
    {offer?<AffiliateAnchor offer={offer} locale={uiLocale} className="bookmaker-logo-link" onActivate={()=>track('bookmaker_logo_clicked',{bookmaker:book.canonicalId,priceKind,placement:offer.placement,campaignId:offer.campaignId},{props:{affiliateEnabled:true}})}>{artwork}</AffiliateAnchor>:<span aria-disabled="true">{artwork}</span>}
  </span>;
}
