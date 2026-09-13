import type {CommercialGeo} from './commercial-geo';
export const GEO_STATES=['VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'] as const;
export type GeoState=typeof GEO_STATES[number];
export function verifiedGeo(state:unknown,geo:CommercialGeo|null){
  if(!geo)return false;
  return state==='VERIFIED_BR_MX'||state===(geo==='BR'?'VERIFIED_BR':'VERIFIED_MX');
}
/** Commercial jurisdiction evidence is separate from the provider feed's domain and from UI locale. */
export function eligibleSource(bookmaker:string,geo:CommercialGeo|null,state:unknown,domain:unknown):boolean{
  if(!geo||!verifiedGeo(state,geo)||typeof domain!=='string')return false;
  const host=domain.toLowerCase().replace(/^www\./,'');
  if(bookmaker==='betano.bet.br')return geo==='BR'&&host==='betano.bet.br';
  // M7 owner-confirmed BR eligibility includes the generic Betsson OddsPapi feed.
  // Mexico still requires its own verification AND its jurisdiction-specific source.
  if(bookmaker==='betsson')return geo==='BR'?['betsson.bet.br','betsson.com'].includes(host):host==='betsson.mx';
  return false;
}
