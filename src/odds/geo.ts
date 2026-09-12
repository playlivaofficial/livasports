import type {SiteLocale} from '@/config/i18n';
export const GEO_STATES=['VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'] as const;
export type GeoState=typeof GEO_STATES[number];
export function verifiedGeo(state:unknown,locale:SiteLocale){return state==='VERIFIED_BR_MX'||state===(locale==='br'?'VERIFIED_BR':'VERIFIED_MX');}
/** A verification flag AND the jurisdiction-specific source must agree. Generic .com stays gated. */
export function eligibleSource(bookmaker:string,locale:SiteLocale,state:unknown,domain:unknown):boolean{
  if(!verifiedGeo(state,locale)||typeof domain!=='string')return false;
  const host=domain.toLowerCase().replace(/^www\./,'');
  if(bookmaker==='betano.bet.br')return locale==='br'&&host==='betano.bet.br';
  if(bookmaker==='betsson')return host===(locale==='br'?'betsson.bet.br':'betsson.mx');
  return false;
}
