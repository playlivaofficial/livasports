import type {CommercialGeo} from './commercial-geo';
export const GEO_STATES=['VERIFIED','VERIFIED_BR','VERIFIED_MX','VERIFIED_CO','VERIFIED_PE','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'] as const;
export type GeoState=typeof GEO_STATES[number];
export function verifiedGeo(state:unknown,geo:CommercialGeo|null){
  if(!geo)return false;
  return state==='VERIFIED'||state===`VERIFIED_${geo}`||((geo==='BR'||geo==='MX')&&state==='VERIFIED_BR_MX');
}
/** Commercial jurisdiction evidence is separate from the provider feed's domain and from UI locale. */
export function eligibleSource(bookmaker:string,geo:CommercialGeo|null,state:unknown,domain:unknown,configuredDomains?:readonly string[]):boolean{
  if(!geo||!verifiedGeo(state,geo)||typeof domain!=='string')return false;
  // An explicit domain allowlist cannot turn a historical BR-only feed into
  // a Mexico/Colombia/Peru operator. Those jurisdictions use distinct mappings.
  if(['betano.bet.br','sportingbet.bet.br','betboo.bet.br'].includes(bookmaker)&&geo!=='BR')return false;
  const host=domain.toLowerCase().replace(/^www\./,'');
  if(configuredDomains!==undefined)return configuredDomains.some(value=>value.toLowerCase().replace(/^www\./,'')===host);
  if(geo==='CO'||geo==='PE')return false;
  if(bookmaker==='betano.bet.br')return geo==='BR'&&host==='betano.bet.br';
  if(bookmaker==='sportingbet.bet.br'||bookmaker==='betboo.bet.br')return geo==='BR'&&(host===bookmaker||host===`sports.${bookmaker}`);
  // M7 owner-confirmed BR eligibility includes the generic Betsson OddsPapi feed.
  // Mexico still requires its own verification AND its jurisdiction-specific source.
  if(bookmaker==='betsson')return geo==='BR'?['betsson.bet.br','betsson.com'].includes(host):host==='betsson.mx';
  // Owner-confirmed on the same basis as Betsson: OddsPapi publishes a single 1xBet feed with no
  // .bet.br clone, and it reports the generic 1xbet.com host on every fixture. BR only — the feed
  // carries no Mexico evidence, so Mexico stays ineligible rather than inheriting this decision.
  if(bookmaker==='1xbet')return geo==='BR'&&['1xbet.com','1xbet.bet.br'].includes(host);
  return false;
}
