import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {NextRequest} from 'next/server';
import {defaultLanguage,languageCookie,publicLanguages} from './interface';
import {LanguageSelector} from './LanguageSelector';
import {POST} from '@/app/language/route';
import {GET as presentation} from '@/app/api/presentation/route';
import {GET as prominence} from '@/app/api/growth/prominence/route';
import {requestEffectiveGeo,requestCommercialGeo} from '@/odds/commercial-geo';
import {geoProfile,isCoreGeo,type Geo} from '@/config/geo';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
import {ownerAction} from '@/owner/server';
import {previewRouteMismatch} from '@/owner/PreviewControls';
import {SportsRepository} from '@/sports/repository';
import type {QueryExecutor} from '@/database/client';
import {CANONICAL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {VISIBLE_BOOKMAKERS} from '@/odds/registry';
import {formatMoney} from '@/slip/decimal';
import {SponsoredSlot} from '@/components/commercial/SponsoredSlot';
import {parseContext,geoAllowed} from '@/affiliate/policy';
import {CacheCoordinator,MemoryCacheStore} from '@/cache/cache';
import {M3RouteDataLoader} from '@/delivery/M3RouteDataLoader';
import {emptyDatabasePage} from '@/delivery/DatabaseM2ReadService';

const f=vi.hoisted(()=>({query:vi.fn(),offer:vi.fn(()=>null),commercial:null as 'mx'|'co'|'pe'|null}));
vi.mock('server-only',()=>({}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=f.query;close=async()=>{};}}));
vi.mock('@/security/request-limit',()=>({requestLimit:async()=>null}));
vi.mock('next/navigation',()=>({usePathname:()=>'/en'}));
vi.mock('@/affiliate/client',()=>({useCommercialOffer:f.offer}));
vi.mock('@/localization/PublicPresentation',()=>({usePublicCommercialLocale:()=>f.commercial,usePublicProductGeo:()=>({geo:'ROW',ready:false})}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:React.ComponentProps<'a'>)=><a {...props}>{children}</a>}));

beforeEach(()=>{
  vi.stubEnv('VERCEL','1');vi.stubEnv('AFFILIATE_QA_GEO','');
  vi.stubEnv('OWNER_QA_SESSION_SECRET','test-only-session-material-'.repeat(3));
  vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('test-only-access-material-'.repeat(3)));
  f.query.mockReset();f.offer.mockClear();f.commercial=null;
});
afterEach(()=>vi.unstubAllEnvs());
const geos=['MX','CO','PE','ROW'] as const;
const matrix=geos.flatMap(geo=>publicLanguages.map(language=>[geo,language] as const));
function h(geo:Geo,language:string,owner=false){
  const cookie=`${languageCookie}=${language}; commercialGeo=PE; qa=1`+(owner?`; ${ownerCookie}=${signOwnerSession({...newOwnerSession(),preview:true,previewGeo:isCoreGeo(geo)?geo:null})}`:'');
  return new Headers({'x-vercel-ip-country':geo==='ROW'?'GE':geo,'x-owner-preview':'PE',cookie});
}

describe('public language × trusted GEO matrix',()=>{
  it.each(matrix)('%s / %s keeps jurisdiction, ranking, Growth, pool, currency and sponsor context',async(geo,language)=>{
    const headers=h(geo,language),locale=defaultLanguage(language,geo),profile=geoProfile(geo);
    const form=new URLSearchParams({locale:language,returnTo:'/pe/futbol?competition=champions-league#fixtures-content'});
    headers.set('origin','https://livasports.com');
    const switched=await POST(new NextRequest('https://livasports.com/language',{method:'POST',headers,body:form}));
    expect(switched.status).toBe(303);expect(switched.headers.get('location')).toContain(`/${locale}/${locale==='br'?'futebol':locale==='en'?'football':'futbol'}?competition=champions-league#fixtures-content`);
    expect(switched.headers.getSetCookie()).toHaveLength(1);expect(switched.headers.get('set-cookie')).toContain(`${languageCookie}=${language}`);
    const after=new Headers(headers);after.set('cookie',switched.headers.get('set-cookie')!.split(';')[0]);
    expect(requestEffectiveGeo(after)).toBe(geo);expect(requestCommercialGeo(after)).toBe(isCoreGeo(geo)?geo:null);
    const body=await presentation(new NextRequest('https://livasports.com/api/presentation',{headers:after})).json();
    expect(body.productGeo).toBe(geo);expect(body.owner.authorized).toBe(false);
    expect(body.commercialLocale).toBe(isCoreGeo(geo)?geo.toLowerCase():null);
    const pools={MX:['betsson'],CO:['betsson','bwin'],PE:['inkabet','1xbet'],ROW:[]};
    const pool=VISIBLE_BOOKMAKERS.filter(b=>isCoreGeo(geo)&&b.countries.some(c=>c===geo)).map(b=>b.canonicalId);
    expect(pool).toEqual(pools[geo]);
    expect(formatMoney('10',body.commercialLocale??'en')).toContain(profile.currency==='MXN'?'MX$':profile.currency==='COP'?'COP$':profile.currency==='PEN'?'S/':'USD');

    const localSlug=geo==='MX'?'liga-mx':geo==='CO'?'colombia-primera-a':geo==='PE'?'peru-liga-1':null;
    const rows=CANONICAL_COMPETITION_TARGETS.map(t=>({slug:t.slug,canonical_name:t.canonicalName,display_name_es_mx:t.displayNames.mx,display_name_pt_br:t.displayNames.br,competition_group:t.group,region:t.region,n:3,growth_rank:t.slug===localSlug?1:null}));
    const query=vi.fn().mockResolvedValue({rows});
    const repo=new SportsRepository({query} as unknown as QueryExecutor);
    const nav=await repo.boardNav(locale,profile.timeZone,geo);
    const baseline=await repo.boardNav(defaultLanguage('es',geo),profile.timeZone,geo);
    expect(nav.map(r=>[r.slug,r.priority])).toEqual(baseline.map(r=>[r.slug,r.priority]));
    expect(query.mock.calls[0][1][2]).toBe(geo);if(localSlug)expect(nav[0].slug).toBe(localSlug);

    f.query.mockResolvedValue({rows:isCoreGeo(geo)?Array.from({length:5},(_,i)=>({fixture_id:`fixture-${i}`,priority_rank:i+1,priority_score:80-i,canonical_url:`https://livasports.com/${geo.toLowerCase()}/partido/local-x-away-0123456789abcde${i}`,context_localized:'Verified test context',competition:'Test league',competition_slug:localSlug,kickoff:'2026-10-11T20:00:00Z',home:'Local',away:'Away',home_public_id:'1111111111111111',away_public_id:'2222222222222222'})):[]});
    const response=await prominence(new Request(`https://livasports.com/api/growth/prominence?locale=${locale}&kind=HOME`,{headers:after}));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const growth=await response.json();expect(growth.geo).toBe(geo);expect(growth.providerRequests).toBe(0);
    // The public Growth box is retired; the GEO's own Top 5 is still selected and served per jurisdiction.
    expect(growth.rows.length).toBe(isCoreGeo(geo)?5:0);
    if(isCoreGeo(geo)){expect(f.query.mock.calls[0][1]).toEqual(['HOME',geo]);
      expect(growth.rows.every((r:{canonicalUrl:string})=>new URL(r.canonicalUrl).pathname.startsWith('/'+geo.toLowerCase()+'/'))).toBe(true);}
    else expect(f.query).not.toHaveBeenCalled();

    f.commercial=body.commercialLocale;
    renderToStaticMarkup(<SponsoredSlot copyLocale={locale} context={{locale:'pe',pagePath:`/${locale}`,placement:'home_top_banner'}}/>);
    const [context,enabled]=f.offer.mock.calls[0] as unknown as [Parameters<typeof parseContext>[0],boolean];
    expect(enabled).toBe(isCoreGeo(geo));if(enabled){const parsed=parseContext(context)!;expect(parsed.locale).toBe(body.commercialLocale);expect(geoAllowed(new Request('https://livasports.com',{headers:after}),parsed.locale)).toBe(true);expect(parsed.pagePath).toBe('/'+body.commercialLocale);}
    const selector=load(renderToStaticMarkup(<LanguageSelector locale={locale}/>));
    expect(selector('button').map((_i,e)=>selector(e).text().replace('✓','')).get()).toEqual(['Español','Português','English']);
    expect(selector('button[aria-current=true]').attr('value')).toBe(language);
  });

  it.each(matrix)('signed owner %s / %s survives language changes without route auto-sync',async(geo,language)=>{
    const headers=h('ROW',language);const session={...newOwnerSession(),preview:isCoreGeo(geo),previewGeo:isCoreGeo(geo)?geo:null};
    headers.set('cookie',`${ownerCookie}=${signOwnerSession(session)}`);headers.set('origin','https://livasports.com');
    const locale=defaultLanguage(language,geo),response=await POST(new NextRequest('https://livasports.com/language',{method:'POST',headers,body:new URLSearchParams({locale:language,returnTo:'/en'})}));
    expect(response.headers.get('location')).toBe('https://livasports.com/'+locale);expect(response.headers.get('set-cookie')).not.toContain(ownerCookie);
    expect(requestEffectiveGeo(headers)).toBe(geo);expect(previewRouteMismatch('/'+locale,session.preview,session.previewGeo)).toBeNull();
  });
  it('direct country paths and forged owner state cannot change a ROW visitor',async()=>{
    for(const path of ['/mx','/co','/pe','/br']){
      const headers=h('ROW','es');headers.set('origin','https://livasports.com');
      expect(requestEffectiveGeo(headers)).toBe('ROW');
      expect((await prominence(new Request(`https://livasports.com/api/growth/prominence?locale=${path.slice(1)}&kind=HOME`,{headers}))).status).toBe(200);
      expect((await ownerAction(new Request('https://livasports.com/api/owner/preview',{method:'POST',headers:{...Object.fromEntries(headers),'content-type':'application/json','sec-fetch-site':'same-origin'},body:JSON.stringify({action:'preview',geo:'PE'})}))).status).toBe(401);
    }
    expect((await prominence(new Request('https://livasports.com/api/growth/prominence?locale=en&kind=HOME&geo=PE',{headers:h('ROW','en')}))).status).toBe(400);
    expect(requestEffectiveGeo(new Headers({'x-vercel-ip-country':'BR'}))).toBe('ROW');
  });
  it('legacy Spanish cookies do not select their old country',()=>{
    for(const legacy of ['mx','co','pe']){expect(defaultLanguage(legacy,'CO')).toBe('co');expect(defaultLanguage(legacy,'PE')).toBe('pe');}
  });
  it('keeps cached board facts partitioned by GEO and attaches odds outside that cache',async()=>{
    const db={loadOrThrow:vi.fn(async(locale:'mx',page:'home',_date:unknown,_tz:unknown,_competition:unknown,geo:Geo)=>({...emptyDatabasePage(locale,page),competitions:[geo]}))};
    const odds={attach:vi.fn(async data=>data)};
    const loader=new M3RouteDataLoader(db,new CacheCoordinator(new MemoryCacheStore()),undefined,undefined,undefined,odds);
    for(const geo of ['CO','PE','CO'] as const)expect((await loader.load('mx','home',undefined,'UTC',undefined,geo)).competitions).toEqual([geo]);
    expect(db.loadOrThrow).toHaveBeenCalledTimes(2);expect(odds.attach).toHaveBeenCalledTimes(3);
  });
});
