'use client';
import {useEffect,useRef,useState} from 'react';
import type {PublicOffer} from '@/affiliate/types';
import {privacyOptOut,qaBrowser} from '@/affiliate/client';
import {emitProductEvent} from '@/components/match/events';
import {AffiliateAnchor,commercialCopy} from './AffiliateLink';

function PublisherEmbed({offer,onFailure}:{offer:PublicOffer;onFailure:()=>void}){
  const c=offer.creative!,box=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null),clicked=useRef(false);
  const [load,setLoad]=useState(false),[ready,setReady]=useState(false),[scale,setScale]=useState(1);
  useEffect(()=>{
    const el=box.current;if(!el)return;
    const denied=()=>privacyOptOut()||offer.embedPermission==='consent'&&!/(?:^|;\s*)livasports_analytics_consent=granted(?:;|$)/.test(document.cookie);
    const size=new ResizeObserver(()=>{const width=el.getBoundingClientRect().width;if(width>0)setScale(Math.min(1,width/c.width));});size.observe(el);
    const near=new IntersectionObserver(entries=>{if(denied()){onFailure();return;}if(entries.some(e=>e.isIntersecting)&&document.visibilityState==='visible')setLoad(true);},{rootMargin:'160px'});near.observe(el);
    const visibility=()=>{if(denied())onFailure();};document.addEventListener('visibilitychange',visibility);window.addEventListener('livasports:privacy-change',visibility);
    const message=(event:MessageEvent)=>{
      if(event.origin!=='null'||event.source!==frame.current?.contentWindow||!event.data||event.data.type!=='livasports:creative'||event.data.key!==offer.token.slice(-43))return;
      if(event.data.kind==='failed'){onFailure();return;}
      if(event.data.kind==='ready'){setReady(true);return;}
      if(event.data.kind==='click'&&ready&&!clicked.current&&!denied()&&navigator.userActivation.isActive){clicked.current=true;emitProductEvent({eventName:'affiliate_embed_click',offer:offer.token,...(qaBrowser()?{qa:true}:{})},'g1:click:'+offer.token.slice(-43));}
    };
    window.addEventListener('message',message);
    return()=>{size.disconnect();near.disconnect();window.removeEventListener('message',message);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('livasports:privacy-change',visibility);};
  },[c.width,offer,onFailure,ready]);
  useEffect(()=>{
    const el=box.current;if(!el||!ready||privacyOptOut())return;let timer:ReturnType<typeof setTimeout>|null=null,seen=false,visible=false;
    const cancel=()=>{if(timer)clearTimeout(timer);timer=null;};
    const attempt=()=>{cancel();if(!seen&&visible&&document.visibilityState==='visible')timer=setTimeout(()=>{
      if(privacyOptOut()||!el.getClientRects().length||getComputedStyle(el).visibility!=='visible'||document.visibilityState!=='visible')return;
      seen=true;emitProductEvent({eventName:'affiliate_impression',offer:offer.token,...(qaBrowser()?{qa:true}:{})},'m8:view:'+offer.token.slice(-43));observer.disconnect();
    },1000);};
    const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);attempt();},{threshold:[0,.5]});observer.observe(el);document.addEventListener('visibilitychange',attempt);
    return()=>{cancel();observer.disconnect();document.removeEventListener('visibilitychange',attempt);};
  },[offer,ready]);
  return <div ref={box} className="sponsor-embed-box" data-ready={ready} style={{width:c.width,maxWidth:'100%',aspectRatio:`${c.width}/${c.height}`}}>
    {load?<iframe ref={frame} title={`${c.imageAlt} · Publicidade · 18+`} width={c.width} height={c.height} loading="lazy" {...{credentialless:''}}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; fullscreen 'none'"
      src={`/api/commercial/creative?offer=${offer.token}`} style={{transform:`scale(${scale})`,background:'transparent'}}/>:null}
  </div>;
}

export function SponsoredCreative({offer,locale}:{offer:PublicOffer;locale:'br'|'mx'|'en'}){
  const [expired,setExpired]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setExpired(true),Math.max(1,Date.parse(offer.expiresAt)-Math.max(Date.now(),Date.parse(offer.resolvedAt))));return()=>clearTimeout(timer);},[offer]);
  const c=offer.creative;if(!c||expired||failed)return null;const text=commercialCopy[locale];
  return <aside className={`commercial-sponsor sponsor-${offer.placement}`} aria-label={text.advertisement} data-placement={offer.placement}>
    <span className="commercial-label">{text.advertisement}</span>
    {c.delivery==='BETSSON_EMBED'?<PublisherEmbed offer={offer} onFailure={()=>setFailed(true)}/>:c.imageUrl?<AffiliateAnchor offer={offer} locale={locale}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.imageUrl} alt={c.imageAlt} width={c.width} height={c.height} loading="lazy" onError={()=>setFailed(true)}/>
    </AffiliateAnchor>:null}
    <p>{text.disclosure} {text.responsible}</p>
  </aside>;
}
