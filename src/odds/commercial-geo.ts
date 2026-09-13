import type {SiteLocale} from '@/config/i18n';
import {ownerPreview} from '@/owner/session';

/** Trusted commercial jurisdiction. Never derived from `/br`, `/mx`, or `/en`. */
export type CommercialGeo = 'BR' | 'MX';

export function requestCountry(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const country = env.VERCEL === '1' ? headers.get('x-vercel-ip-country') : env.AFFILIATE_QA_GEO;
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

export function requestCommercialGeo(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): CommercialGeo | null {
  if(ownerPreview(headers,env))return 'BR';
  const country = requestCountry(headers, env);
  return country === 'BR' || country === 'MX' ? country : null;
}

export function commercialLocale(geo: CommercialGeo | null): SiteLocale | null {
  return geo === 'BR' ? 'br' : geo === 'MX' ? 'mx' : null;
}

/** Campaign/bookmaker rows store jurisdiction as `br`/`mx`; this is not UI language. */
export function commercialGeoFromLocale(locale: string): CommercialGeo | null {
  return locale === 'br' ? 'BR' : locale === 'mx' ? 'MX' : null;
}

export function commercialIso2(geo: CommercialGeo | null): string | null {
  return geo;
}
