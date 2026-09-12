'use client';
import {useEffect,useState} from 'react';
import type {PublicOffer} from '@/affiliate/types';
import {AffiliateAnchor,commercialCopy} from './AffiliateLink';
export function SponsorCreative({offer,locale}:{offer:PublicOffer;locale:'br'|'mx'}){
  const [expired,setExpired]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setExpired(true),Math.max(1,Date.parse(offer.expiresAt)-Math.max(Date.now(),Date.parse(offer.resolvedAt))));return()=>clearTimeout(timer);},[offer]);
  const c=offer.creative;if(!c||expired)return null;const text=commercialCopy[locale];
  return <aside className={`commercial-sponsor sponsor-${offer.placement}`} aria-label={text.advertisement} data-placement={offer.placement}>
    <span className="commercial-label">{text.advertisement}</span><AffiliateAnchor offer={offer} locale={locale}>
      {/* Only approved, first-party raster assets reach this component. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.imageUrl} alt={c.imageAlt} width={c.width} height={c.height} loading="lazy"/>
    </AffiliateAnchor><p>{text.disclosure} {text.responsible}</p></aside>;
}
