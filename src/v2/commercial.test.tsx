import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {pendingOperatorSlots} from './commercial';
import {GeoCommercialSection} from './CommercialSection';
import {interfaceLocales} from '@/localization/interface';
import {requestCommercialGeo} from '@/odds/commercial-geo';
const state=vi.hoisted(()=>({locale:null as 'mx'|'co'|'pe'|null}));
vi.mock('@/localization/PublicPresentation',()=>({usePublicCommercialLocale:()=>state.locale}));
afterEach(()=>{state.locale=null;vi.unstubAllEnvs();});
describe('inactive commercial inventory',()=>{
 it.each(interfaceLocales)('%s language never changes the operator inventory',locale=>{for(const [geo,ids] of Object.entries({MX:['betsson','winpot.mx'],CO:['betsson','bwin'],PE:['inkabet','1xbet']})){
  const slots=pendingOperatorSlots(geo,locale);expect(slots.map(slot=>slot.operatorId)).toEqual(ids);
  for(const slot of slots){expect(slot.countryCode).toBe(geo);expect(slot.affiliateEnabled).toBe(false);expect(slot.commercialStatus).toBe('pending_verification');expect(slot.trackingDestination).toBeNull();expect(slot.campaignId).toBeNull();expect(slot.offerTitle).toBeNull();expect(slot.offerTerms).toBeNull();expect(slot.lastVerifiedAt).toBeNull();expect(slot.paymentMethods).toEqual([]);}
 }});
 it.each(['BR','US','GE','ES','PT','ROW','mx','co','pe','',null,undefined])('fails closed for untrusted or retired country %s',geo=>{expect(pendingOperatorSlots(geo,'mx')).toEqual([]);});
 it.each(['mx','co','pe'] as const)('renders pending %s slots with no executable affiliate link',locale=>{state.locale=locale;const html=renderToStaticMarkup(<GeoCommercialSection locale="en"/>);expect((html.match(/class="v2-operator-card"/g)??[])).toHaveLength(2);expect((html.match(/disabled=""/g)??[])).toHaveLength(2);expect(html).not.toMatch(/href="(?:\/go\/|https?:|#")|data-affiliate|aggregateRating/);expect(html).toContain('pending_verification');});
 it('shows no commercial module before the private trusted-GEO read',()=>{expect(renderToStaticMarkup(<GeoCommercialSection locale="mx"/>)).toBe('');});
 it.each(['MX','CO','PE'])('does not trust a forged %s country header off Vercel',geo=>{vi.stubEnv('VERCEL','');vi.stubEnv('AFFILIATE_QA_GEO','');expect(requestCommercialGeo(new Headers({'x-vercel-ip-country':geo,cookie:'commercialGeo=MX; owner_preview=MX'}))).toBeNull();});
 it.each(['BR','US','GE',''])('keeps trusted %s visitors globally accessible but commercially closed',geo=>{vi.stubEnv('VERCEL','1');expect(requestCommercialGeo(new Headers({'x-vercel-ip-country':geo}))).toBeNull();});
});
