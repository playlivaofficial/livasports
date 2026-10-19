import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {NextRequest} from 'next/server';
import {browserLanguage,defaultLanguage,interfaceLocales,languageCookie,languageSwitchTarget,publicLanguage,translatedPath,type PublicLanguage} from './interface';
import {LanguageSelector} from './LanguageSelector';
import {V2Header,useEditorialEdition} from '@/v2/Header';
import {RegionalNews} from '@/multisport/RegionalNews';
import {previewNews} from '@/editorial/seed';
import {POST} from '@/app/language/route';
import {proxy} from '@/proxy';
import {requestCommercialGeo,requestEffectiveGeo} from '@/odds/commercial-geo';
import matrix from '../../docs/v3-language-route-matrix.json';

vi.mock('next/navigation',()=>({usePathname:()=>'/en/news'}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('three public languages with five preserved route namespaces',()=>{
 it.each(interfaceLocales)('renders exactly ES/EN/PT in the %s Header without a country selector',locale=>{
  const $=load(renderToStaticMarkup(<V2Header locale={locale}/>));
  expect($('.language-picker')).toHaveLength(1);
  expect($('.language-picker button[name=locale]').map((_,node)=>$(node).attr('value')).get()).toEqual(['es','en','pt']);
  expect($('.language-picker button[name=locale]').map((_,node)=>$(node).text().replace('✓','')).get()).toEqual(['ES — Español','EN — English','PT — Português']);
  expect($('.language-picker summary').text()).toBe(publicLanguage(locale).toUpperCase()+'⌄');
  expect($('select,.v2-edition,[name=geo],[name=country]')).toHaveLength(0);
  expect($('.v2-desktop-nav a')).toHaveLength(4);expect($('.v2-bottom-nav a')).toHaveLength(4);expect($('.v2-bottom-nav button')).toHaveLength(1);
  expect($('.v2-bottom-nav a').eq(3).attr('href')).toMatch(/#standings$/);
  expect($('.v2-menu-panel .theme-toggle')).toHaveLength(1);expect($('.v2-menu-panel .auth-header-link')).toHaveLength(1);
 });
 it.each([['mx',['Deportes','Noticias','Clasificaciones','Herramientas'],['Inicio','Deportes','Noticias','Tablas','Más']],['en',['Sports','News','Standings','Tools'],['Home','Sports','News','Tables','More']],['br',['Esportes','Notícias','Classificações','Ferramentas'],['Início','Esportes','Notícias','Tabelas','Mais']]] as const)('translates %s navigation', (locale,desktop,bottom)=>{
  const $=load(renderToStaticMarkup(<V2Header locale={locale}/>));
  expect($('.v2-desktop-nav a').map((_,node)=>$(node).text()).get()).toEqual(desktop);
  expect($('.v2-bottom-nav span').map((_,node)=>$(node).text()).get()).toEqual(bottom);
 });
 it('keeps the legacy full-name picker accessible without country flags',()=>{
  const $=load(renderToStaticMarkup(<LanguageSelector locale="co"/>));expect($('summary').attr('aria-label')).toBe('Idioma: Español');
  expect($('summary').text()).toBe('Español⌄');expect($('img')).toHaveLength(0);
 });
 it('ignores old edition storage and offers the same regional reporting in every language',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('MUST_NOT_READ_COUNTRY_PREFERENCE');}});
  const source=readFileSync('src/v2/Header.tsx','utf8');expect(source).not.toMatch(/localStorage|livasports:edition|\.setItem/);
  const selections=interfaceLocales.map(locale=>{
   expect(useEditorialEdition(locale)).toBe('international');
   const $=load(renderToStaticMarkup(<RegionalNews items={previewNews} locale={locale}/>));
   return $('a.ed-card-link').map((_,node)=>$(node).attr('href')!.split('/').at(-1)).get();
  });
  expect(selections[0].length).toBeGreaterThan(0);for(const selection of selections)expect(selection).toEqual(selections[0]);
 });
 it('keeps light/dark token colors and a compact mobile control budget',()=>{
  const css=readFileSync('src/v2/v2.css','utf8');
  expect(css).toContain('.v2-header .language-picker button{color:var(--v2-text);min-height:44px}');
  expect(css).toContain('.v2-header-theme,.v2-header-session{display:none}');
  expect(css).toContain('.v2-header .v2-search-link{display:inline-flex}');
  expect(css).toContain('.v2-header .language-picker summary{min-width:52px;font-size:12px}');
  expect(css).toContain('.v2-menu-panel .theme-toggle{width:44px;min-width:44px;height:44px}');
 });
});

describe('first visit, persistence and commercial isolation',()=>{
 it.each([['es-ES,es;q=0.9,en;q=0.7','es'],['pt-PT,en;q=0.5','pt'],['de-DE,pt;q=0.8,en;q=0.9','en'],['fr,es;q=0,pt;q=0.7','pt'],['fr,*;q=0.5',null],['en;q=2,es;q=0.8','es'],['pt;q=NaN',null]] as const)('resolves supported weighted browser preferences %s',(header,language)=>expect(browserLanguage(header)).toBe(language));
 it.each([['ES','mx'],['PT','br'],['MX','mx'],['CO','co'],['PE','pe'],['BR','br'],['GE','en'],['US','en'],[null,'en']] as const)('uses the trusted %s language default only without a supported preference',(country,locale)=>expect(defaultLanguage(null,country)).toBe(locale));
 it('prioritizes explicit saved language over browser and geography',()=>{
  expect(defaultLanguage('en','MX','es-MX')).toBe('en');expect(defaultLanguage('pt','ES','en')).toBe('br');expect(defaultLanguage(null,'GE','es-ES')).toBe('mx');
  expect(defaultLanguage(null,'MX','en-US')).toBe('en');expect(defaultLanguage('es','CO','pt')).toBe('co');
 });
 it('uses browser language only for the private root redirect, never an explicit language path',async()=>{
  vi.stubEnv('VERCEL','1');
  const root=await proxy(new NextRequest('https://livasports.com/',{headers:{'x-vercel-ip-country':'GE','accept-language':'pt-PT'}}));
  expect(root.headers.get('location')).toBe('https://livasports.com/br');expect(root.headers.get('vary')).toContain('Accept-Language');expect(root.headers.get('cache-control')).toContain('no-store');
  const explicit=await proxy(new NextRequest('https://livasports.com/en',{headers:{'x-vercel-ip-country':'MX','accept-language':'es',cookie:`${languageCookie}=pt`}}));
  expect(explicit.headers.has('location')).toBe(false);expect(explicit.headers.has('set-cookie')).toBe(false);
 });
 it.each(matrix.examples)('preserves the documented page and filters: $from → $language',example=>{
  const target=languageSwitchTarget(example.language as PublicLanguage,example.from,example.country);expect(translatedPath(example.from,target)).toBe(example.to);
 });
 it.each(['MX','CO','PE','BR','GE','US','ES','PT','ZZ'])('switches every language without altering %s GEO or auth cookies',async country=>{
  vi.stubEnv('VERCEL','1');
  for(const language of ['es','en','pt'] as const){
   const headers=new Headers({origin:'https://livasports.com','x-vercel-ip-country':country,cookie:'authjs.session-token=synthetic-session; commercialGeo=MX; livasports_language=en'}),before=headers.get('cookie');
   const geo=requestEffectiveGeo(headers),commercial=requestCommercialGeo(headers);
   const response=await POST(new NextRequest('https://livasports.com/language',{method:'POST',headers,body:new URLSearchParams({locale:language,returnTo:'/en/news?newsSport=basketball&newsTopic=nba&newsCountry=international#news-feed-heading'})}));
   expect(response.status).toBe(303);expect(response.headers.getSetCookie()).toHaveLength(1);expect(response.headers.get('set-cookie')).toContain(`${languageCookie}=${language}`);expect(response.headers.get('set-cookie')).not.toMatch(/authjs|commercialGeo|owner/i);
   expect(response.headers.get('location')).toContain('?newsSport=basketball&newsTopic=nba&newsCountry=international#news-feed-heading');
   expect(headers.get('cookie')).toBe(before);expect(requestEffectiveGeo(headers)).toBe(geo);expect(requestCommercialGeo(headers)).toBe(commercial);
   if(!['MX','CO','PE'].includes(country))expect(commercial).toBeNull();
  }
 });
});
