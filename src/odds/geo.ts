import type {SiteLocale} from '@/config/i18n';
export const GEO_STATES=['VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'] as const;
export type GeoState=typeof GEO_STATES[number];
export function verifiedGeo(state:unknown,locale:SiteLocale){return state==='VERIFIED_BR_MX'||state===(locale==='br'?'VERIFIED_BR':'VERIFIED_MX');}
/** Commercial jurisdiction evidence is separate from the provider feed's domain. */
export function eligibleSource(bookmaker:string,locale:SiteLocale,state:unknown,domain:unknown):boolean{
  if(!verifiedGeo(state,locale)||typeof domain!=='string')return false;
  const host=domain.toLowerCase().replace(/^www\./,'');
  if(bookmaker==='betano.bet.br')return locale==='br'&&host==='betano.bet.br';
  // M7 owner-confirmed BR eligibility includes the generic Betsson OddsPapi feed.
  // Mexico still requires its own verification AND its jurisdiction-specific source.
  if(bookmaker==='betsson')return locale==='br'?['betsson.bet.br','betsson.com'].includes(host):host==='betsson.mx';
  return false;
}
