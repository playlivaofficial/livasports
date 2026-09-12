import type {SiteLocale} from '@/config/i18n';

// Only jurisdiction-specific destinations. Generic .com never proves BR/MX availability.
const hosts:Record<string,readonly string[]>={
  'betano.bet.br:br':['betano.bet.br','www.betano.bet.br'],
  'betsson:br':['betsson.bet.br','www.betsson.bet.br'],
};
export function safeAffiliateDestination(bookmaker:string,locale:SiteLocale,destination:unknown):string|null{
  if(typeof destination!=='string')return null;
  try{const url=new URL(destination);if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[`${bookmaker}:${locale}`]?.includes(url.hostname))return null;
    return url.toString();}catch{return null;}
}
