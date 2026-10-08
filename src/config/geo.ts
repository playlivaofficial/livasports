/** Authoritative product/GEO profile. Route language is not proof of commercial jurisdiction. */
export const CORE_GEOS = ['MX', 'CO', 'PE'] as const;
export type CoreGeo = typeof CORE_GEOS[number];
export type Geo = CoreGeo | 'BR' | 'ROW';
export type GeoLocale = 'mx' | 'co' | 'pe' | 'br' | 'en';
export interface GeoProfile {
  geo: Geo; locale: GeoLocale; languageTag: 'es-MX'|'es-CO'|'es-PE'|'pt-BR'|'en';
  currency: 'MXN'|'COP'|'PEN'|'BRL'|'USD'; timeZone: string; countryName: string;
  commercialEnabled: boolean; competitionWeights: Readonly<Record<string, number>>;
}

// Demand seeds, not fixed positions. One shared fixture scorer combines them with verified context.
const weights = (highest: readonly string[], strong: readonly string[]): Readonly<Record<string, number>> =>
  Object.freeze(Object.fromEntries([...highest.map(slug => [slug, 30] as const), ...strong.map(slug => [slug, 20] as const)]));
export const GEO_PROFILES: Readonly<Record<Geo, GeoProfile>> = {
  MX: {geo:'MX',locale:'mx',languageTag:'es-MX',currency:'MXN',timeZone:'America/Mexico_City',countryName:'México',commercialEnabled:true,
    competitionWeights:weights(['liga-mx','champions-league','premier-league','la-liga','concacaf-champions-cup','leagues-cup'],
      ['liga-expansion-mx','europa-league','copa-libertadores','mls','argentina-primera-division','serie-a-italy','bundesliga'])},
  CO: {geo:'CO',locale:'co',languageTag:'es-CO',currency:'COP',timeZone:'America/Bogota',countryName:'Colombia',commercialEnabled:true,
    competitionWeights:weights(['colombia-primera-a','champions-league','copa-libertadores','premier-league','la-liga','copa-sudamericana'],
      ['copa-colombia','europa-league','argentina-primera-division','brasileirao-serie-a','serie-a-italy','bundesliga','liga-mx'])},
  PE: {geo:'PE',locale:'pe',languageTag:'es-PE',currency:'PEN',timeZone:'America/Lima',countryName:'Perú',commercialEnabled:true,
    competitionWeights:weights(['peru-liga-1','champions-league','copa-libertadores','premier-league','la-liga','copa-sudamericana'],
      ['europa-league','argentina-primera-division','brasileirao-serie-a','serie-a-italy','liga-mx','bundesliga'])},
  BR: {geo:'BR',locale:'br',languageTag:'pt-BR',currency:'BRL',timeZone:'America/Sao_Paulo',countryName:'Brasil',commercialEnabled:false,competitionWeights:Object.freeze({})},
  ROW: {geo:'ROW',locale:'en',languageTag:'en',currency:'USD',timeZone:'UTC',countryName:'International',commercialEnabled:false,competitionWeights:Object.freeze({})},
};
export function isCoreGeo(value: unknown): value is CoreGeo { return CORE_GEOS.includes(value as CoreGeo); }
export function geoFromCountry(country: unknown): Geo { return isCoreGeo(country) ? country : 'ROW'; }
export function geoForLocale(locale: string): Geo { return ({mx:'MX',co:'CO',pe:'PE',br:'BR'} as const)[locale as 'mx'|'co'|'pe'|'br'] ?? 'ROW'; }
export function geoProfile(geo: Geo): GeoProfile { return GEO_PROFILES[geo]; }
export function competitionDemand(geo: Geo, slug: string): number { return GEO_PROFILES[geo].competitionWeights[slug] ?? 10; }
export function isSpanishLocale(locale: string): locale is 'mx'|'co'|'pe' { return ['mx','co','pe'].includes(locale); }
