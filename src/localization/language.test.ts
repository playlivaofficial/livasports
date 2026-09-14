import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
import {defaultLanguage,interfaceRoutes,languageCookie,translatedPath,languageAlternates} from './interface';
import {englishSportsData} from './sports-copy';
import {routeMetadata} from '@/config/metadata';
import {POST} from '@/app/language/route';
import {proxy} from '@/proxy';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';

afterEach(()=>vi.unstubAllEnvs());
describe('interface language defaults and commercial isolation',()=>{
  it.each([['BR','br'],['MX','mx'],['US','en'],['GE','en'],[null,'en'],['','en']])('defaults %s to %s',(country,locale)=>expect(defaultLanguage(null,country)).toBe(locale));
  it.each(['br','mx','en'] as const)('manual %s overrides every GEO',(locale)=>{for(const country of ['BR','MX','US',null])expect(defaultLanguage(locale,country)).toBe(locale);});
  it('ignores an invalid manual value',()=>expect(defaultLanguage('https://elsewhere.test','MX')).toBe('mx'));
  it('uses platform GEO only in Vercel and keeps root redirects private',async()=>{
    vi.stubEnv('VERCEL','1');
    const request=new NextRequest('https://livasports.com/',{headers:{'x-vercel-ip-country':'BR'}});
    const result=await proxy(request);expect(result.headers.get('location')).toBe('https://livasports.com/br');expect(result.headers.get('cache-control')).toContain('no-store');
    vi.stubEnv('VERCEL','0');expect((await proxy(request)).headers.get('location')).toBe('https://livasports.com/en');
  });
  it('applies a persisted choice on the next root visit',async()=>{
    vi.stubEnv('VERCEL','1');const result=await proxy(new NextRequest('https://livasports.com/',{headers:{'x-vercel-ip-country':'BR',cookie:`${languageCookie}=mx`}}));
    expect(result.headers.get('location')).toBe('https://livasports.com/mx');
  });
  it('explicit URLs win and forwarding never rewrites commercial GEO',async()=>{
    const response=await proxy(new NextRequest('https://livasports.com/en/football',{headers:{'x-vercel-ip-country':'BR','x-livasports-interface-language':'mx',cookie:`${languageCookie}=br`}}));
    expect(response.headers.get('x-middleware-request-x-livasports-interface-language')).toBe('en');
    expect(response.headers.get('x-middleware-request-x-vercel-ip-country')).toBe('BR');
    expect(response.headers.has('set-cookie')).toBe(false);
  });
  it('English listing keeps the Odds column and does not treat /en as commercial GEO',()=>{
    const source=readFileSync(new URL('../components/sports/SportsBoardPage.tsx',import.meta.url),'utf8');
    expect(source).toContain('OddsComparison');
    expect(source).toContain("loadM3PageData(locale==='en'?'br':locale");
    expect(source).not.toContain("geoEligibility.locale");
    expect(source).toContain("sponsor('home_right_rail')");
    expect(source).toContain('requestCommercialGeo(await headers())');
  });
  it('keeps an English-home Betsson rail in the third sports-layout column',()=>{
    const css=readFileSync(new URL('../app/language.css',import.meta.url),'utf8');
    expect(css).toContain('.english-sports .sports-layout:has(> .sponsor-home_right_rail)');
    expect(css).toMatch(/\.english-sports \.sports-layout:has\(> \.sponsor-home_right_rail\) \{ grid-template-columns:190px minmax\(0,1fr\) 300px; \}/);
  });
});
describe('context preservation and safe language POST',()=>{
  it.each(['home','football','today','live'] as const)('preserves %s page',(page)=>{
    for(const from of ['br','mx','en'] as const)for(const to of ['br','mx','en'] as const)expect(translatedPath(interfaceRoutes[from][page]+'?view=list#fixtures-content',to)).toBe(interfaceRoutes[to][page]+'?view=list#fixtures-content');
  });
  it.each([['jogo','partido','match'],['time','equipo','team'],['jogador','jugador','player']])('preserves %s public identity, filters and section',(br,mx,en)=>{
    const segments={br,mx,en},suffix='/same-entity-0123456789abcdef?view=recent#statistics';
    for(const from of ['br','mx','en'] as const)for(const to of ['br','mx','en'] as const)expect(translatedPath(`/${from}/${segments[from]}${suffix}`,to)).toBe(`/${to}/${segments[to]}${suffix}`);
  });
  it.each(['https://evil.test','//evil.test','/\\evil.test','/br/../../api/affiliate','/api/affiliate','/en/match/bad','/en%0d%0aLocation:evil'])('rejects unsafe or unrelated destinations %s',input=>expect(translatedPath(input,'en')).toBe('/en'));
  const request=(locale:string,returnTo:string,origin='https://livasports.com')=>new NextRequest('https://livasports.com/language',{method:'POST',headers:{origin},body:new URLSearchParams({locale,returnTo})});
  it('preserves independent historical squad and results selections through the language endpoint',async()=>{
    const query='?matches=results&p=2&season=01234567-89ab-cdef-0123-456789abcdef&squadSeason=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee#squad';
    const segments={br:'time',mx:'equipo',en:'team'};
    for(const from of ['br','mx','en'] as const)for(const to of ['br','mx','en'] as const){
      const response=await POST(request(to,`/${from}/${segments[from]}/team-0123456789abcdef${query}`));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(`https://livasports.com/${to}/${segments[to]}/team-0123456789abcdef${query}`);
    }
  });
  it('sets only the first-party language cookie and redirects with 303',async()=>{
    const response=await POST(request('en','/br/time/flamengo-0123456789abcdef#squad'));
    expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('https://livasports.com/en/team/flamengo-0123456789abcdef#squad');
    const cookie=response.headers.get('set-cookie');expect(cookie).toContain(`${languageCookie}=en`);expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=lax');expect(cookie).toContain('Path=/');
    expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.getSetCookie()).toHaveLength(1);
  });
  it('blocks cross-origin writes and invalid languages without cookies',async()=>{
    for(const req of [request('en','/br','https://evil.test'),request('de','/br')]){const response=await POST(req);expect(response.status).toBeGreaterThanOrEqual(400);expect(response.headers.has('set-cookie')).toBe(false);}
  });
});
describe('sports localization and search metadata',()=>{
  it('projects all 34 registered competitions without mutating stored facts',()=>{
    const rows=FOOTBALL_COMPETITION_TARGETS.map(target=>({competition:target.displayNames.br,id:target.key,team:'São Paulo',score:0}));
    const original=JSON.stringify(rows),copy=englishSportsData(rows);expect(copy).toHaveLength(34);expect(JSON.stringify(rows)).toBe(original);
    expect(copy[0].id).toBe(rows[0].id);expect(copy[0].score).toBe(0);expect(copy[0].team).toBe('São Paulo');expect(copy.some(row=>row.competition==='UEFA Champions League')).toBe(true);
  });
  it('provides reciprocal canonical, hreflang and English x-default on every index route',()=>{
    for(const locale of ['br','mx','en'] as const)for(const page of ['home','football','live','today'] as const){const m=routeMetadata(locale,page);
      expect(m.alternates?.canonical).toBe(interfaceRoutes[locale][page]);expect(m.alternates?.languages).toEqual(languageAlternates(interfaceRoutes.br[page],interfaceRoutes.mx[page],interfaceRoutes.en[page]));
    }
  });
});
