import {describe,expect,it} from 'vitest';
import {commercialGeoFromLocale,commercialLocale,requestCommercialGeo,requestCountry} from './commercial-geo';

describe('commercial GEO is independent of UI locale', () => {
  it('reads trusted Vercel country and ignores off-Vercel spoofed headers', () => {
    const br = new Headers({'x-vercel-ip-country': 'BR'});
    expect(requestCommercialGeo(br, {VERCEL: '1'})).toBe('BR');
    expect(requestCommercialGeo(br, {})).toBeNull();
    expect(requestCommercialGeo(new Headers({'x-vercel-ip-country': 'US'}), {VERCEL: '1'})).toBeNull();
    expect(requestCommercialGeo(new Headers(), {AFFILIATE_QA_GEO: 'BR'})).toBe('BR');
    expect(requestCommercialGeo(new Headers(), {AFFILIATE_QA_GEO: 'MX'})).toBe('MX');
  });

  it('does not treat route locale as GEO evidence', () => {
    expect(requestCountry(new Headers({'x-livasports-interface-language': 'br'}), {VERCEL: '1'})).toBeNull();
    expect(commercialLocale(null)).toBeNull();
    expect(commercialLocale('BR')).toBe('br');
    expect(commercialLocale('MX')).toBe('mx');
    expect(commercialGeoFromLocale('br')).toBe('BR');
    expect(commercialGeoFromLocale('en')).toBeNull();
  });
});
