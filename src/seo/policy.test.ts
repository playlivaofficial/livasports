import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
// authPageMetadata lives beside the sign-in/account pages; keep next-auth and the database out of this policy test.
vi.mock('@/auth/config',()=>({auth:async()=>null}));
vi.mock('@/auth/database',()=>({authConfigured:()=>false,emailAuthConfigured:()=>false,googleAuthConfigured:()=>false}));
vi.mock('@/auth/actions',()=>({signOutUser:async()=>undefined,updateDisplayName:async()=>undefined}));
vi.mock('@/auth/session',()=>({userProviders:async()=>[],currentUser:async()=>null}));
vi.mock('@/favorites/database',()=>({favoritesRepository:()=>({})}));
import {absoluteUrl,competitionCanonical,competitionRequest,enabledCompetitionSlugs,isNonSemanticParam,isPrivatePath,locales,privatePathPrefixes,robotsDisallow,routePolicies} from './policy';
import {competitionClusters,primarySitemap} from './sitemap';
import {serializeJsonLd} from './json-ld';
import {competitionHubSchema,siteSchema} from './structured-data';
import {robotsForEnvironment} from '@/app/robots';
import {validateSitemapUrls,sitemapEntriesXml} from '@/sports/sitemap';
import {competitionPath,competitionTabs,resolveDefaultSeason} from '@/sports/policy';
import {translatedPath} from '@/localization/interface';
import {myMatchesMetadata} from '@/favorites/pages';
import {authPageMetadata} from '@/auth/pages';
import {documentMetadata} from '@/localization/DocumentPage';
import {helpKinds,helpPath} from '@/localization/help-routes';
import {helpContent} from '@/localization/help-content';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import type {CompetitionHub} from '@/sports/types';
import type {Metadata} from 'next';

const S1='11111111-1111-4111-8111-111111111111',S0='00000000-0000-4000-8000-000000000000';
const slugs=enabledCompetitionSlugs();

describe('P2 route policy',()=>{
  it('uses the live registry count and every enabled competition has a policy-backed canonical in three locales',()=>{
    expect(slugs).toHaveLength(FOOTBALL_COMPETITION_TARGETS.filter(t=>t.enabled).length);
    expect(slugs.length).toBeGreaterThan(0);
    const seen=new Set<string>();
    for(const slug of slugs)for(const tab of competitionTabs){
      const canonical=competitionCanonical({slug,tab,seasonId:S1,defaultSeasonId:S1,page:1,pages:1,rows:1});
      for(const locale of locales){expect(seen.has(canonical.paths[locale])).toBe(false);seen.add(canonical.paths[locale]);}
      expect(canonical.paths.br.startsWith('/br/futebol?competition=')).toBe(true);
      expect(canonical.paths.mx.startsWith('/mx/futbol?competition=')).toBe(true);
      expect(canonical.paths.en.startsWith('/en/football?competition=')).toBe(true);
      for(const locale of locales)expect(translatedPath(canonical.paths[locale],'en')).toBe(canonical.paths.en);
    }
    expect(seen.size).toBe(slugs.length*competitionTabs.length*3);
  });
  it('orders semantic parameters deterministically and never includes non-semantic ones',()=>{
    const canonical=competitionCanonical({slug:'liga-mx',tab:'results',seasonId:S0,defaultSeasonId:S1,page:3,pages:5,rows:30});
    expect(canonical.paths.mx).toBe(`/mx/futbol?competition=liga-mx&tab=results&season=${S0}&p=3`);
    expect(validateSitemapUrls([absoluteUrl(canonical.paths.mx)])).toEqual([]);
    for(const name of ['utm_campaign','fbclid','date','view','q','theme','matches','squadSeason'])expect(isNonSemanticParam(name)).toBe(true);
    for(const name of ['competition','tab','season','p'])expect(isNonSemanticParam(name)).toBe(false);
    expect(competitionRequest({competition:'liga-mx',tab:'nope',season:'bad',p:'0',utm_source:'x'})).toMatchObject({slug:'liga-mx',known:true,tab:'fixtures',season:undefined,page:1,search:false});
  });
  it('classifies out-of-range pages, empty tabs and missing seasons as non-indexable without inventing identities',()=>{
    expect(competitionCanonical({slug:'mls',tab:'results',seasonId:S1,defaultSeasonId:S1,page:4,pages:3,rows:0})).toMatchObject({indexable:false,reason:'page-out-of-range',page:1});
    expect(competitionCanonical({slug:'mls',tab:'standings',seasonId:S1,defaultSeasonId:S1,page:1,pages:1,rows:0})).toMatchObject({indexable:false,reason:'empty-tab'});
    expect(competitionCanonical({slug:'mls',tab:'fixtures',seasonId:null,defaultSeasonId:null,page:1,pages:1,rows:0})).toMatchObject({indexable:false,reason:'no-season'});
    expect(competitionCanonical({slug:'mls',tab:'standings',seasonId:S1,defaultSeasonId:S1,page:7,pages:1,rows:5})).toMatchObject({indexable:true,page:1});
  });
  it('resolves the default season identically for hubs and sitemaps',()=>{
    const seasons=[{id:'a',fixtures:0,verifiedEmpty:true},{id:'b',fixtures:0,verifiedEmpty:false},{id:'c',fixtures:12}];
    expect(resolveDefaultSeason(seasons)?.id).toBe('c');
    expect(resolveDefaultSeason([{id:'a',fixtures:0,verifiedEmpty:false},{id:'c',fixtures:12}])?.id).toBe('a');
    expect(resolveDefaultSeason([])).toBeNull();
  });
  it('keeps private, personalised and utility surfaces out of every sitemap and hreflang cluster',()=>{
    for(const path of privatePathPrefixes())expect(isPrivatePath(path)).toBe(true);
    expect(isPrivatePath('/br/meus-jogos?x=1')).toBe(true);expect(isPrivatePath('/br/futebol?competition=copa-do-brasil')).toBe(false);
    for(const locale of locales){
      expect(myMatchesMetadata(locale).robots).toEqual({index:false,follow:true});
      expect((myMatchesMetadata(locale) as Metadata).alternates?.languages).toBeUndefined();
      expect(authPageMetadata(locale,'signin').robots).toEqual({index:false,follow:false});
      expect((authPageMetadata(locale,'account') as Metadata).alternates?.languages).toBeUndefined();
      expect(routePolicies.myMatches.sitemap).toBe(false);expect(routePolicies.account.indexable).toBe(false);
    }
    const urls=primarySitemap(null).map(row=>row.url);
    expect(urls.some(isPrivatePath)).toBe(false);
    expect(validateSitemapUrls(urls)).toEqual([]);
  });
  it('robots: production allows query identities and fences tooling; preview blocks everything and never leaks into production',()=>{
    const production=robotsForEnvironment('production');
    expect(production.rules).toEqual({userAgent:'*',allow:'/',disallow:[...robotsDisallow]});
    expect(production.sitemap).toEqual(['https://livasports.com/sitemap.xml','https://livasports.com/sports-sitemaps.xml']);
    expect((robotsDisallow as readonly string[]).some(rule=>rule.includes('?')||rule.includes('*')||['/br/','/en/','/mx/','/'].includes(rule))).toBe(false);
    for(const environment of ['preview','development',undefined]){const robots=robotsForEnvironment(environment);expect(robots.rules).toEqual({userAgent:'*',disallow:'/'});expect(robots.sitemap).toBeUndefined();}
    // Disallowed prefixes are exactly the non-content families in the policy table.
    const disallowedFamilies=Object.values(routePolicies).filter(p=>p.crawl==='disallow').length;
    expect(disallowedFamilies).toBe(6);
  });
});

describe('P2 sitemap policy',()=>{
  const summary=(slug:string,over:Partial<Parameters<typeof competitionClusters>[0] extends readonly (infer T)[]|null?T:never>={})=>({slug,seasonId:S1,upcoming:3,results:10,standings:true,scorers:false,teams:true,updatedAt:new Date('2026-09-10T00:00:00Z'),...over});
  it('emits only indexable tabs for the default season and drops tab detail (not competitions) when the database fails',()=>{
    const clusters=competitionClusters([summary('la-liga'),summary('fa-cup',{standings:false,teams:false,results:0,upcoming:0})]);
    const enPaths=clusters.map(c=>c.paths.en);
    expect(enPaths).toContain('/en/football?competition=la-liga');expect(enPaths).toContain('/en/football?competition=la-liga&tab=results');
    expect(enPaths).toContain('/en/football?competition=la-liga&tab=standings');expect(enPaths).toContain('/en/football?competition=la-liga&tab=teams');
    expect(enPaths).not.toContain('/en/football?competition=la-liga&tab=scorers');
    expect(enPaths.filter(p=>p.includes('fa-cup'))).toEqual([]);
    expect(enPaths.some(p=>p.includes('season='))).toBe(false);
    expect(clusters.find(c=>c.paths.en.endsWith('la-liga'))?.lastModified?.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    const degraded=competitionClusters(null);
    expect(degraded).toHaveLength(slugs.length);expect(degraded.every(c=>!c.lastModified)).toBe(true);
  });
  it('produces valid, duplicate-free absolute URLs with lastmod only where a source date exists',()=>{
    const rows=primarySitemap([summary('premier-league')]);
    expect(validateSitemapUrls(rows.map(r=>r.url))).toEqual([]);
    expect(rows.filter(r=>r.url.includes('premier-league'))).toHaveLength(4*3);
    expect(rows.filter(r=>r.lastModified===undefined).length).toBe(4*3+slugs.length*3-3);
    expect(rows.every(r=>!('changeFrequency' in r)&&!('priority' in r))).toBe(true);
  });
  it('rejects wrong origins, private paths, tracking parameters, fragments and duplicates',()=>{
    expect(validateSitemapUrls(['http://livasports.com/br','https://livasports.vercel.app/en','https://livasports.com/en/my-matches','https://livasports.com/en/football?competition=mls&utm_source=x',
      'https://livasports.com/en/football?tab=results&competition=mls','https://livasports.com/en#top','/en','https://livasports.com/en','https://livasports.com/en']).map(p=>p.reason))
      .toEqual(['wrong-origin','wrong-origin','private-path','non-semantic-param','param-order','fragment','not-absolute','duplicate']);
  });
  it('escapes entity names in XML and bounds every batch under the sitemap limits',()=>{
    const xml=sitemapEntriesXml('teams',[{publicId:'0123456789abcdef',name:'Ca\'s & <Boys> "FC"',updatedAt:'2026-09-01T00:00:00Z'}]);
    expect(xml).not.toMatch(/<Boys>|&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });
});

describe('P2 structured data',()=>{
  it('serialises JSON-LD safely against script-closing and separator payloads',()=>{
    const out=serializeJsonLd({name:'</script><script>alert(1)</script>',note:'a b & <!--'});
    expect(out).not.toContain('</script>');expect(out).not.toContain('<!--');expect(out).not.toContain(' ');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
  it('home carries Organization + WebSite and hubs carry a breadcrumb that mirrors the visible hierarchy',()=>{
    const site=siteSchema('br');
    expect(site.map(s=>s['@type'])).toEqual(['Organization','WebSite']);
    expect(JSON.stringify(site)).not.toMatch(/foundingDate|address|aggregateRating|offers/);
    const hub={slug:'copa-do-brasil',name:'Copa do Brasil',season:{id:S0,name:'2025',current:false,fixtures:1},defaultSeasonId:S1} as CompetitionHub;
    const crumbs=competitionHubSchema('br',hub,'results').itemListElement;
    expect(crumbs.map(c=>c.item)).toEqual(['https://livasports.com/br','https://livasports.com/br/futebol',absoluteUrl(competitionPath('br','copa-do-brasil')),absoluteUrl(competitionPath('br','copa-do-brasil',{season:S0})),absoluteUrl(competitionPath('br','copa-do-brasil',{tab:'results',season:S0}))]);
    expect(competitionHubSchema('en',{...hub,defaultSeasonId:S0},'fixtures').itemListElement).toHaveLength(3);
  });
});

describe('P2 evergreen help',()=>{
  it('publishes three topics per locale with reciprocal clusters, article Open Graph and language-selector mapping',()=>{
    expect(helpKinds).toHaveLength(3);
    for(const locale of locales)for(const kind of helpKinds){
      const slug=helpPath(locale,kind).split('/')[2],metadata=documentMetadata(locale,slug);
      expect(metadata.robots).toBeUndefined();expect(metadata.alternates?.canonical).toBe(helpPath(locale,kind));
      expect(metadata.alternates?.languages).toEqual({'pt-BR':helpPath('br',kind),'es-MX':helpPath('mx',kind),en:helpPath('en',kind),'x-default':helpPath('en',kind)});
      expect((metadata.openGraph as {type:string}).type).toBe('article');
      for(const target of locales)expect(translatedPath(helpPath(locale,kind),target)).toBe(helpPath(target,kind));
      const text=JSON.stringify(helpContent[locale][kind]);
      expect(text).not.toMatch(/licen[cs]|expert|especialista|prediction|previs[ãa]o|pron[óo]stico|melhor pre[çc]o garantido|best price guaranteed/i);
    }
    expect(documentMetadata('en','not-a-document').robots).toEqual({index:false,follow:false});
  });
});
