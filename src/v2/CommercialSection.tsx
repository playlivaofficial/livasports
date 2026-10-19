'use client';
import Link from 'next/link';
import {usePublicCommercialLocale} from '@/localization/PublicPresentation';
import type {InterfaceLocale} from '@/localization/interface';
import {v2Copy} from './copy';
import {pendingOperatorSlots,type CommercialSlot} from './commercial';
import {Icon} from './Icon';
import {v2Path} from './routes';

export function OperatorLogoSlot({name,asset}:{name:string;asset:string|null}){return <span className="v2-operator-logo">{asset?
  // Fixed local identity artwork; no per-request image transformation.
  // eslint-disable-next-line @next/next/no-img-element
  <img src={asset} alt={name} width={140} height={48} loading="lazy"/>:<strong>{name}</strong>}</span>;}
export function AffiliateCtaSlot({locale}:{locale:InterfaceLocale}){return <button type="button" className="v2-button v2-pending-button" disabled>{v2Copy(locale).pendingCta}<Icon name="shield"/></button>;}
export function OfferTermsBlock({slot,locale}:{slot:CommercialSlot;locale:InterfaceLocale}){return <p className="v2-fineprint">{slot.offerTitle??v2Copy(locale).pending}</p>;}
export function OperatorComparisonCard({slot,locale}:{slot:CommercialSlot;locale:InterfaceLocale}){
  const text=v2Copy(locale);
  return <article className="v2-operator-card" data-commercial-country={slot.countryCode} data-commercial-status={slot.commercialStatus}><div className="v2-operator-heading"><OperatorLogoSlot name={slot.operatorName} asset={slot.logoAsset}/><span className="v2-country-tag">{slot.countryCode}</span></div><h3>{slot.operatorName}</h3><p>{text.checkLicense}</p><ul><li><Icon name="shield"/>{text.checkWithdraw}</li><li><Icon name="shield"/>{text.checkSafety}</li></ul><OfferTermsBlock slot={slot} locale={locale}/><AffiliateCtaSlot locale={locale}/><Link className="v2-text-link" href={slot.reviewPath}>{text.review}<span aria-hidden="true">↗</span></Link></article>;
}
export function GeoCommercialSection({locale,placementId='v2-home',operatorId}:{locale:InterfaceLocale;placementId?:string;operatorId?:string}){
  const eligible=usePublicCommercialLocale(),text=v2Copy(locale);
  const slots=pendingOperatorSlots(eligible?.toUpperCase(),locale,placementId).filter(slot=>!operatorId||slot.operatorId===operatorId);
  if(!slots.length)return null;
  return <section className="v2-section v2-commercial"><div className="v2-section-heading"><div><span className="v2-eyebrow">18+ · {slots[0].countryCode}</span><h2>{text.compare}</h2></div><Link className="v2-text-link" href={v2Path(locale,'bookmakers')}>{text.viewAll}<Icon name="arrow"/></Link></div><p className="v2-section-lead">{text.compareLead}</p><div className="v2-operator-grid">{slots.map(slot=><OperatorComparisonCard key={slot.operatorId} slot={slot} locale={locale}/>)}</div><p className="v2-fineprint">{text.commercialNote}</p></section>;
}
