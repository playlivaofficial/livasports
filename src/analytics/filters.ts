import type {ReportFilters} from './reporting';
import {PAGE_TYPES,REFERRER_CLASSES} from './taxonomy';
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v;
/** Owner dashboard filters from GET query parameters; anything outside the allowlist is dropped. */
export function parseFilters(query:Record<string,string|string[]|undefined>):ReportFilters{
  const w=one(query.window);const locale=one(query.locale),geo=one(query.geo),bookmaker=one(query.bookmaker),competition=one(query.competition),pageType=one(query.pageType),source=one(query.source),traffic=one(query.traffic);
  return {window:w==='today'||w==='30d'?w:'7d',locale:locale==='br'||locale==='mx'||locale==='en'?locale:undefined,geo:geo==='BR'||geo==='MX'?geo:undefined,
    bookmaker:bookmaker==='betano.bet.br'||bookmaker==='betsson'?bookmaker:undefined,competition:competition&&/^[a-z0-9-]{2,64}$/.test(competition)?competition:undefined,
    pageType:(PAGE_TYPES as readonly string[]).includes(pageType??'')?pageType as ReportFilters['pageType']:undefined,source:(REFERRER_CLASSES as readonly string[]).includes(source??'')?source as ReportFilters['source']:undefined,
    traffic:traffic==='QA'||traffic==='OWNER'||traffic==='BOT'?traffic:undefined};
}
