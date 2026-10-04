import type {SiteLocale} from '@/config/i18n';
import {ownerPreview} from '@/owner/session';
import {geoFromCountry,geoForLocale,geoProfile,isCoreGeo,type CoreGeo,type Geo} from '@/config/geo';

/** Trusted commercial jurisdiction. Never derived from `/br`, `/mx`, or `/en`. */
export type CommercialGeo = CoreGeo | 'BR';

export function requestCountry(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const country = env.VERCEL === '1' ? headers.get('x-vercel-ip-country') : env.AFFILIATE_QA_GEO;
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

export function requestCommercialGeo(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): CommercialGeo | null {
  const geo=requestEffectiveGeo(headers,env);
  return isCoreGeo(geo)?geo:null;
}

/** Public routes/cookies cannot select a jurisdiction. Only trusted edge or signed owner state. */
export function requestEffectiveGeo(headers:Headers,env:Readonly<Record<string,string|undefined>>=process.env):Geo {
  const preview=ownerPreview(headers,env);
  return preview?.previewGeo??geoFromCountry(requestCountry(headers,env));
}

export function commercialLocale(geo: CommercialGeo | null): SiteLocale | null {
  return geo ? geoProfile(geo).locale as SiteLocale : null;
}

/** Campaign/bookmaker rows store jurisdiction as `br`/`mx`; this is not UI language. */
export function commercialGeoFromLocale(locale: string): CommercialGeo | null {
  const geo=geoForLocale(locale);return geo==='BR'||isCoreGeo(geo)?geo:null;
}

export function commercialIso2(geo: CommercialGeo | null): string | null {
  return geo;
}
