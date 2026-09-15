'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import type {CommercialContext,PublicOffer} from '@/affiliate/types';
import {privacyOptOut,qaBrowser,useCommercialOffer} from '@/affiliate/client';
import {emitProductEvent} from '@/components/match/events';
import {translatedPath} from '@/localization/interface';

export const commercialCopy={
  br:{cta:'Ver odds',advertisement:'Publicidade',responsible:'18+. Aposte com responsabilidade.',disclosure:'Podemos receber uma comissão pelos links de parceiros. Isso não altera a ordem das odds.',destination:'Abre o site da casa. Confira suas seleções e as odds lá.'},
  mx:{cta:'Ver cuotas',advertisement:'Publicidad',responsible:'18+. Apuesta con responsabilidad.',disclosure:'Podemos recibir una comisión por enlaces de socios. Esto no cambia el orden de las cuotas.',destination:'Abre el sitio de la casa. Revisa tus selecciones y las cuotas allí.'},
  en:{cta:'View odds',advertisement:'Advertisement',responsible:'18+. Gamble responsibly.',disclosure:'We may receive a commission from partner links. That does not change the order of the odds.',destination:'Opens the bookmaker site. Check your selections and the odds there.'},
};
export type CommercialCopyLocale=keyof typeof commercialCopy;
export function AffiliateAnchor({offer,locale,className,children,onActivate}:{offer:PublicOffer;locale:CommercialCopyLocale;className?:string;children?:ReactNode;onActivate?:()=>void}){
  const ref=useRef<HTMLAnchorElement>(null),[expired,setExpired]=useState(false);const text=commercialCopy[locale];
  useEffect(()=>{const remaining=Date.parse(offer.expiresAt)-Math.max(Date.now(),Date.parse(offer.resolvedAt));const timer=setTimeout(()=>setExpired(true),Math.max(1,remaining));return()=>clearTimeout(timer);},[offer]);
  useEffect(()=>{const link=ref.current;if(!link||expired||privacyOptOut())return;let timer:ReturnType<typeof setTimeout>|null=null,seen=false,visible=false;
    const cancel=()=>{if(timer)clearTimeout(timer);timer=null;};
    const attempt=()=>{cancel();if(!seen&&visible&&document.visibilityState==='visible')timer=setTimeout(()=>{
      if(!link.getClientRects().length||getComputedStyle(link).visibility!=='visible'||document.visibilityState!=='visible'||[...link.querySelectorAll('img')].some(img=>!img.complete||!img.naturalWidth))return;
      seen=true;emitProductEvent({eventName:'affiliate_impression',offer:offer.token,...(qaBrowser()?{qa:true}:{})},'m8:view:'+offer.token.slice(-43));observer.disconnect();
    },1000);};
    const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);attempt();},{threshold:[0,.5]});
    observer.observe(link);link.addEventListener('load',attempt,true);document.addEventListener('visibilitychange',attempt);return()=>{cancel();observer.disconnect();link.removeEventListener('load',attempt,true);document.removeEventListener('visibilitychange',attempt);};
  },[offer,expired]);
  if(expired)return null;
  return <a ref={ref} className={className} href={offer.href} target="_blank" rel="sponsored nofollow noopener noreferrer" aria-label={`${text.cta} · ${offer.bookmaker==='betsson'?'Betsson':'Betano BR'}`}
    onClick={event=>{if(!event.isTrusted||qaBrowser())event.currentTarget.href=offer.href+'&qa=1';onActivate?.();}}
    onAuxClick={event=>{if(!event.isTrusted||qaBrowser())event.currentTarget.href=offer.href+'&qa=1';}}>{children??<>{text.cta} <span aria-hidden="true">↗</span></>}</a>;
}
export function AffiliateLink({context,className,onActivate,compact=false,onAvailability,uiLocale,children}:{context:Omit<CommercialContext,'pagePath'>;className?:string;onActivate?:()=>void;compact?:boolean;onAvailability?:(bookmaker:string,available:boolean)=>void;uiLocale?:CommercialCopyLocale;children?:ReactNode}){
  const pathname=usePathname()??'';
  const pagePath=context.locale==='br'&&pathname.startsWith('/en')?translatedPath(pathname,'br'):pathname;
  const offer=useCommercialOffer({...context,pagePath});const text=commercialCopy[uiLocale??context.locale];
  const available=!!offer,bookmaker=context.bookmaker??'';
  useEffect(()=>{onAvailability?.(bookmaker,available);return()=>onAvailability?.(bookmaker,false);},[onAvailability,bookmaker,available]);
  if(!offer)return null;
  return <div className="affiliate-action"><AffiliateAnchor key={offer.token} offer={offer} locale={uiLocale??context.locale} className={className} onActivate={onActivate}>{children}</AffiliateAnchor>
    {!compact?<><p className="commercial-caption">{text.destination}</p><p className="commercial-caption">{text.disclosure}</p></>:null}</div>;
}
