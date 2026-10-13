import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/analytics/server',()=>({recordServerEvent:vi.fn().mockResolvedValue(true)}));
import {parseContext} from './policy';
import {resolveOffer,publicOffer} from './service';
import {verifyOffer} from './tokens';
import {outboundRequest,type CommercialServices} from './server';
import {campaign,dependencies,key} from './fixtures.test-support';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import type {Campaign,CommercialContext} from './types';

const cases=[['mx','betsson','betsson.mx'],['mx','winpot.mx','winpot.mx'],['co','betsson','betsson.co'],
  ['co','bwin','bwin.co'],['pe','inkabet','inkabet.pe'],['pe','1xbet','1xbet.pe']] as const;
function fixture(locale:typeof cases[number][0],bookmaker:typeof cases[number][1],host:string,count=1){
  const now=Date.now(),c:Campaign={...campaign(now),locale,bookmaker,destination:`https://${host}/?approved=synthetic-test`,domains:[host],operatorDomains:[host]};
  const context:CommercialContext={locale,bookmaker,pagePath:`/${locale}`,placement:'slip_bookmaker_comparison',cta:'visit',selections:comparisonFixture(count,now).selections};
  const deps={...dependencies(c),pricing:vi.fn().mockResolvedValue(null)};
  return {c,context,deps,now};
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('normal tracked sportsbook visits are independent of indicative slip prices',()=>{
  for(const [locale,bookmaker,host] of cases)for(const count of [1,3,5,10]){
    it(`${locale}/${bookmaker}/${count} legs: resolves and redirects without claiming an executable total`,async()=>{
      const f=fixture(locale,bookmaker,host,count);expect(parseContext(f.context)).toEqual(f.context);
      const offer=await resolveOffer(f.context,f.deps,f.now);expect(offer).not.toBeNull();
      const publicValue=publicOffer(offer!,key,f.now),token=verifyOffer(publicValue.token,key,f.now)!;
      expect(token.context.cta).toBe('visit');expect(token.context.bookmaker).toBe(bookmaker);
      expect(token.context.selections).toHaveLength(count);expect(f.deps.pricing).not.toHaveBeenCalled();
      expect(publicValue.href).toMatch(new RegExp('^/go/'+bookmaker.replaceAll('.','\\.')+'/slip_bookmaker_comparison\\?offer='));
      const tasks:Array<()=>Promise<void>>=[],services:CommercialServices={deps:f.deps,key,geo:()=>true,defer:fn=>tasks.push(fn),click:vi.fn().mockResolvedValue(null),impression:vi.fn().mockResolvedValue(undefined)};
      const r=await outboundRequest(new Request('https://livasports.com'+publicValue.href+'&qa=1'),bookmaker,'slip_bookmaker_comparison',services);
      expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(f.c.destination);
      await Promise.all(tasks.map(fn=>fn()));expect(services.click).toHaveBeenCalledWith(expect.objectContaining({context:f.context}),expect.any(String),'QA_TEST',key);
      expect(f.deps.pricing).not.toHaveBeenCalled();
      // The distinct price-specific path cannot obtain a price offer by relying on the visit intent.
      const {cta:_,...priceContext}=f.context;void _;
      expect(await resolveOffer(priceContext,f.deps,f.now)).toBeNull();
    });
  }
  it('does not admit a visit intent on match prices, sponsor slots, or unnamed books',()=>{
    const f=fixture('co','bwin','bwin.co');
    expect(parseContext({...f.context,bookmaker:undefined})).toBeNull();
    expect(parseContext({...f.context,cta:'bet'})).toBeNull();
    expect(parseContext({...f.context,placement:'home_top_banner'})).toBeNull();
    expect(parseContext({locale:'co',bookmaker:'bwin',pagePath:'/co/partido/a-x-b-0123456789abcdef',placement:'match_odds_table',cta:'visit',fixturePublicId:'0123456789abcdef',market:'MATCH_WINNER'})).toBeNull();
  });
  it('preserves campaign approval, GEO, expiry, safe destination and placement gates',async()=>{
    const f=fixture('co','bwin','bwin.co');
    for(const change of [{enabled:false},{approved:false},{affiliateApproved:false},{geoEligible:false},{locale:'pe' as const},
      {endsAt:new Date(f.now-1).toISOString()},{destination:'https://unapproved.invalid/'},{placements:[]},{destination:null}]){
      expect(await resolveOffer(f.context,{...f.deps,campaigns:async()=>[{...f.c,...change}]},f.now)).toBeNull();
    }
    const value=publicOffer((await resolveOffer(f.context,f.deps,f.now))!,key,f.now);
    const services:CommercialServices={deps:f.deps,key,geo:()=>false,defer:vi.fn(),click:vi.fn(),impression:vi.fn()};
    const r=await outboundRequest(new Request('https://livasports.com'+value.href),'bwin','slip_bookmaker_comparison',services);
    expect(r.headers.get('location')).not.toBe(f.c.destination);expect(services.defer).not.toHaveBeenCalled();
    // The intent is HMAC-bound, not a browser query override that can convert a price token.
    const [body,signature]=value.token.split('.'),payload=JSON.parse(Buffer.from(body,'base64url').toString());
    payload.context.cta='logo';expect(verifyOffer(Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+signature,key,f.now)).toBeNull();
  });
});
