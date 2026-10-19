import React from 'react';
import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {interfaceLocales,type InterfaceLocale} from '@/localization/interface';
import {editorialSitemapXml} from '@/v2/seo';
import {auditSitemapInventory,selectAuditPages} from '../../scripts/v2-route-inventory';
import {initialNews,previewNews} from './seed';
import {transitionNews,validateNewsDraft,type NewsRecord,type PublishedNews} from './model';
import {declareOriginalNewsLanguage,setNewsTranslationAvailable} from './translations';
import {newsTranslationRoutes} from './presentation';
import {NewsCard,PhotoCredit,FeaturedNews,FeaturedStoryHero,selectFeaturedStory} from './NewsCards';
import {NewsFeed} from './NewsFeed';
import {NewsArticlePage,newsMetadata} from './pages';
import {editorialAssets} from './assets';
import {newsPath} from './copy';
import {V2Footer} from '@/v2/Footer';
import {EditorialSearch} from '@/v2/Search';
import {v2Copy} from '@/v2/copy';
import {sportsPath} from '@/multisport/catalog';

const database=vi.hoisted(()=>({story:null as PublishedNews|null}));
vi.mock('./server',()=>({publishedStory:async()=>database.story,publishedNews:async()=>database.story?[database.story]:[]}));
vi.mock('@/v2/pages',()=>({V2Shell:({children}:{children:ReactNode})=><main>{children}</main>}));
const now=new Date('2026-10-19T12:00:00.000Z');
function spanishOnly(){
  const draft=setNewsTranslationAvailable(setNewsTranslationAvailable(declareOriginalNewsLanguage(structuredClone(initialNews[0]),'es'),'en',false),'pt',false);
  const record:NewsRecord={slug:draft.slug,draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
  return transitionNews(transitionNews(record,'review',undefined,now),'publish',undefined,now).published!;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);database.story=spanishOnly();});
afterEach(()=>vi.useRealTimers());

describe('truthful public news translations',()=>{
  it('labels a fallback card and gives its headline/summary the actual language',()=>{
    const item=spanishOnly(),$=load(renderToStaticMarkup(<NewsCard item={item} locale="en" lead/>));
    expect($('h3').text()).toBe(item.title.es);expect($('h3').attr('lang')).toBe('es');expect($('.ed-card-copy>p').attr('lang')).toBe('es');
    expect($('.ed-language-notice').text()).toBe('Original in Spanish; English translation unavailable.');
    expect($('.ed-card-link').attr('href')).toBe(newsPath('en',item.slug));expect($('.ed-language-notice').attr('lang')).toBe('en');
  });
  it.each(['mx','co','pe'] as const)('uses existing %s Spanish namespace without an unnecessary fallback label',locale=>{
    const item=spanishOnly(),$=load(renderToStaticMarkup(<NewsCard item={item} locale={locale}/>));expect($('.ed-language-notice')).toHaveLength(0);
    expect(newsTranslationRoutes(item,locale)).toMatchObject({canonical:newsPath(locale,item.slug),indexable:true,locales:['mx','co','pe']});
  });
  it('omits a corrupt/unreviewed original from both card output and feed counts',()=>{
    const item=spanishOnly(),bad={...item,translationReview:{...item.translationReview!,es:{state:'pending' as const,reviewedAt:null}}};
    expect(renderToStaticMarkup(<NewsCard item={bad} locale="en"/>)).toBe('');
    const $=load(renderToStaticMarkup(<NewsFeed items={[bad]} locale="en" initialTime={now.toISOString()}/>));expect($('.ed-feed-count').text()).toBe('0');expect($('.ed-empty')).toHaveLength(1);
  });
  it('uses real content language throughout fallback detail and JSON-LD without changing the interface language',async()=>{
    const item=database.story!,$=load(renderToStaticMarkup(await NewsArticlePage({locale:'en',slug:item.slug})));
    expect($('h1').text()).toBe(item.title.es);expect($('h1').attr('lang')).toBe('es');expect($('.ed-story-text').attr('lang')).toBe('es');
    expect($('.ed-language-notice').text()).toContain('English translation unavailable');expect($('.ed-source strong').text()).toBe('Original source');
    const schema=JSON.parse($('script[type="application/ld+json"]').text());expect(schema.inLanguage).toBe('es');expect(schema.mainEntityOfPage).toBe('https://livasports.com'+newsPath('mx',item.slug));expect(schema.datePublished).toBe(item.publishedAt);expect(schema.dateModified).toBe(item.updatedAt);
  });
  it('does not advertise a missing translation as indexable metadata or hreflang',async()=>{
    const item=database.story!,metadata=await newsMetadata('en',item.slug);
    expect(metadata.title).toBe(item.title.es);expect(metadata.description).toBe(item.summary.es);expect(metadata.robots).toEqual({index:false,follow:true});
    expect(metadata.alternates).toEqual({canonical:newsPath('mx',item.slug),languages:{'es-MX':newsPath('mx',item.slug),'es-CO':newsPath('co',item.slug),'es-PE':newsPath('pe',item.slug),'x-default':newsPath('mx',item.slug)}});
    expect(metadata.other).toEqual({'content-language':'es'});
    const native=await newsMetadata('co',item.slug);expect(native.robots).toBeUndefined();expect(native.alternates?.canonical).toBe(newsPath('co',item.slug));
  });
  it('retains all five canonical routes for complete legacy publications',async()=>{
    database.story=previewNews[0];for(const locale of interfaceLocales){const metadata=await newsMetadata(locale,database.story.slug);expect(metadata.robots).toBeUndefined();expect(metadata.alternates?.canonical).toBe(newsPath(locale,database.story.slug));expect(Object.keys(metadata.alternates?.languages??{})).toHaveLength(6);}
  });
  it('returns not found instead of inventing text for an invalid original',async()=>{
    database.story={...spanishOnly(),originalLanguage:'fr'} as unknown as PublishedNews;
    await expect(newsMetadata('en',database.story.slug)).rejects.toThrow();await expect(NewsArticlePage({locale:'en',slug:database.story.slug})).rejects.toThrow();
  });
  it.each([{sourcePublishedOn:'2026-10-20'},{publishedAt:'2026-10-20T00:00:00.000Z'},{verifiedAt:'not-a-date'},{updatedAt:'2026-02-30T12:00:00.000Z'},{sourceUrl:'https://evil.example/unapproved'}])('excludes invalid/future publication evidence from every public news surface %#',async patch=>{
    const item={...spanishOnly(),...patch};database.story=item;
    expect(renderToStaticMarkup(<NewsCard item={item} locale="en" now={now}/>)).toBe('');expect(renderToStaticMarkup(<FeaturedNews items={[item]} locale="en" now={now}/>)).toBe('');
    const feed=load(renderToStaticMarkup(<NewsFeed items={[item]} locale="en" initialTime={now.toISOString()}/>));expect(feed('.ed-feed-count').text()).toBe('0');expect(feed('.ed-news-card')).toHaveLength(0);
    const search=load(renderToStaticMarkup(<EditorialSearch locale="en" news={[item]} initialTime={now.toISOString()}/>));expect(search(`a[href="${newsPath('en',item.slug)}"]`)).toHaveLength(0);
    await expect(newsMetadata('en',item.slug)).rejects.toThrow();await expect(NewsArticlePage({locale:'en',slug:item.slug})).rejects.toThrow();
  });
  it('uses the server-supplied timestamp for client feed/search eligibility even after the browser clock advances',()=>{
    const future={...previewNews[0],publishedAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-20T00:00:00.000Z',verifiedAt:'2026-10-20T00:00:00.000Z'};
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    const feed=load(renderToStaticMarkup(<NewsFeed items={[future]} locale="en" initialTime={now.toISOString()}/>));expect(feed('.ed-feed-count').text()).toBe('0');
    const search=load(renderToStaticMarkup(<EditorialSearch locale="en" news={[future]} initialTime={now.toISOString()}/>));expect(search(`a[href="${newsPath('en',future.slug)}"]`)).toHaveLength(0);
    const eligible=load(renderToStaticMarkup(<NewsFeed items={[future]} locale="en" initialTime="2026-10-20T12:00:00.000Z"/>));expect(eligible('.ed-feed-count').text()).toBe('1');
  });
});

describe('available-language news sitemap clusters',()=>{
  it('submits only reviewed translations with reciprocal available-language alternates',()=>{
    const item=spanishOnly(),body=editorialSitemapXml([item],[],now),$=load(body,{xmlMode:true});
    const entries=$('url').filter((_,node)=>$(node).find('loc').text().endsWith('/'+item.slug));expect(entries).toHaveLength(3);
    for(const node of entries.toArray()){expect($(node).find('xhtml\\:link')).toHaveLength(4);expect($(node).find('[hreflang="en"]')).toHaveLength(0);expect($(node).find('[hreflang="pt-BR"]')).toHaveLength(0);expect($(node).find('lastmod').text()).toBe(item.updatedAt);}
    const audit=auditSitemapInventory(body,now.getTime());expect(audit.findings).toEqual([]);
    const news=audit.clusters.find(cluster=>cluster.kind==='news')!;expect(news.locales).toEqual(['mx','co','pe']);expect(news.fallback).toBe('https://livasports.com'+newsPath('mx',item.slug));
    expect(selectAuditPages(audit.clusters).filter(page=>page.cluster.kind==='news').map(page=>page.locale)).toEqual(['mx','co','pe']);
  });
  it('refuses invalid and future-dated publication records without synthesizing lastmod',()=>{
    for(const patch of [{verifiedAt:''},{publishedAt:'2026-10-20T12:00:00.000Z'},{updatedAt:'invalid'},{sourcePublishedOn:'2026-10-20'}]){
      const item={...spanishOnly(),...patch},$=load(editorialSitemapXml([item],[],now),{xmlMode:true});expect($('loc').filter((_,node)=>$(node).text().endsWith('/'+item.slug))).toHaveLength(0);
    }
  });
  it('rejects omitted declared language URLs and nonreciprocal language clusters',()=>{
    const item=spanishOnly(),body=editorialSitemapXml([item],[],now),$=load(body,{xmlMode:true}),node=$('url').filter((_,element)=>$(element).find('loc').text()==='https://livasports.com'+newsPath('co',item.slug));
    node.remove();expect(auditSitemapInventory($.xml(),now.getTime()).findings.some(item=>item.problem==='MISSING_CANONICAL')).toBe(true);
    const altered=body.replace(`hreflang="es-CO" href="https://livasports.com${newsPath('co',item.slug)}"`,`hreflang="en" href="https://livasports.com${newsPath('en',item.slug)}"`);
    expect(auditSitemapInventory(altered,now.getTime()).findings.length).toBeGreaterThan(0);
  });
});

describe('genuine lead story and visible image attribution',()=>{
  it.each([['ufc-octagon','mma','ufc'],['basketball-arena','basketball','nba'],['tennis-court','tennis','wimbledon']] as const)('allows %s only with the matching sport and a caption in every available language',(image,sport,competition)=>{
    const draft={...structuredClone(initialNews[0]),sport,competition,image,imageCaption:{en:'Archive context, not a photograph of the reported event.',es:'Imagen de archivo; no corresponde al hecho narrado.',pt:'Imagem de arquivo; não retrata o fato noticiado.'}};
    expect(validateNewsDraft(draft,now)).toEqual([]);
    expect(validateNewsDraft({...draft,sport:'football',competition:'liga-mx'},now)).toContain('Choose an archive photograph reviewed for this sport, or no photograph.');
    expect(validateNewsDraft({...draft,imageCaption:{...draft.imageCaption,pt:''}},now).length).toBeGreaterThan(0);
    const declared=setNewsTranslationAvailable(declareOriginalNewsLanguage(draft,'es'),'pt',false);expect(validateNewsDraft(declared,now)).toEqual([]);
  });
  it('selects the newest featured source with an approved image, not the most recently republished old source',()=>{
    const old={...spanishOnly(),image:'azteca' as const,imageCaption:{en:'',es:'Vista de archivo del estadio; no corresponde a esta noticia.',pt:''},slug:'older-source',sourcePublishedOn:'2026-10-17'},recent={...old,slug:'recent-source',sourcePublishedOn:'2026-10-18',featured:true};
    expect(selectFeaturedStory([old,recent], 'en',now)?.slug).toBe('recent-source');
    const $=load(renderToStaticMarkup(<FeaturedStoryHero items={[old,recent]} locale="en" now={now}/>));expect($('h1')).toHaveLength(1);expect($('h1').text()).toBe(recent.title.es);expect($('h1').attr('lang')).toBe('es');expect($('.ed-hero-source time').attr('datetime')).toBe(recent.sourcePublishedOn);expect($('.ed-hero-source a').attr('href')).toBe(recent.sourceUrl);expect($('.v2-hero-actions a').attr('href')).toBe(newsPath('en',recent.slug));expect($('.ed-hero-photo-caption').text()).toContain(recent.imageCaption.es);
  });
  it('returns no hero for empty, undated, unreviewed, wrong-sport or imageless candidates',()=>{
    const item=spanishOnly();for(const candidate of [{...item,featured:false},{...item,image:'none' as const},{...item,verifiedAt:''},{...item,sourcePublishedOn:'2026-12-01'},{...item,image:'ufc-octagon' as const},{...item,translationReview:{...item.translationReview!,es:{state:'pending' as const,reviewedAt:null}}}])expect(selectFeaturedStory([candidate],'en',now)).toBeNull();
    expect(renderToStaticMarkup(<FeaturedStoryHero items={[]} locale="en" now={now}/>)).toBe('');
  });
  it.each(['ufc-octagon','basketball-arena','tennis-court'] as const)('shows complete %s credit, source, license and derivative notice',id=>{
    for(const locale of ['en','mx','br'] as InterfaceLocale[]){const $=load(renderToStaticMarkup(<PhotoCredit id={id} locale={locale}/>));expect($('.ed-photo-credit').text()).toContain(editorialAssets[id].credit);expect($('.ed-photo-credit').text()).toContain('WebP');expect($(`a[href="${editorialAssets[id].source}"]`)).toHaveLength(1);expect($(`a[href="${editorialAssets[id].license}"]`)).toHaveLength(1);}
  });
  it('keeps photo credits outside clickable cards, including the photographer’s full attribution',()=>{
    const item={...previewNews[0],sport:'tennis' as const,competition:'wimbledon' as const,image:'tennis-court' as const,imageCaption:{en:'Archive view of a tennis court, not this news event.',es:'Vista de archivo de una pista de tenis; no corresponde a esta noticia.',pt:'Vista de arquivo de uma quadra de tênis; não retrata esta notícia.'}},$=load(renderToStaticMarkup(<NewsCard item={item} locale="en"/>));
    expect($('.ed-news-card>.ed-photo-credit')).toHaveLength(1);expect($('.ed-card-link .ed-photo-credit')).toHaveLength(0);expect($('.ed-card-link a')).toHaveLength(0);expect($('.ed-photo-credit').text()).toContain('Arne Müseler / arne-mueseler.com / CC BY-SA 3.0 DE');
  });
});

describe('truthful multisport framing',()=>{
  it.each(interfaceLocales)('uses sports framing and canonical directory links in the %s footer',locale=>{
    const $=load(renderToStaticMarkup(<V2Footer locale={locale}/>)),copy=v2Copy(locale);
    expect($(`a[href="${sportsPath(locale)}"]`)).toHaveLength(1);expect($(`a[href="${sportsPath(locale)}#standings"]`)).toHaveLength(1);
    expect(copy.footerLead).not.toMatch(/football|fútbol|futebol/i);expect(copy.searchPrompt).not.toMatch(/football|fútbol|futebol/i);expect(copy.aboutTitle).not.toMatch(/football|fútbol|futebol/i);
    expect(copy.quiz).toMatch(/football|fútbol|futebol/i);expect(copy.aboutBody).toMatch(/football|fútbol|futebol/i);
  });
  it('makes original-language news searchable without disguising its missing translation',()=>{
    const item=spanishOnly(),$=load(renderToStaticMarkup(<EditorialSearch locale="en" news={[item]} initialTime={now.toISOString()}/>)),result=$(`a[href="${newsPath('en',item.slug)}"]`);
    expect(result.find('strong').text()).toBe(item.title.es);expect(result.find('strong').attr('lang')).toBe('es');expect(result.find('.ed-language-notice').text()).toContain('English translation unavailable');
    expect($('#editorial-search').attr('placeholder')).toBe('Search sports news, competitions, guides and tools');expect($('a[href="/en/sports/basketball/nba"]')).toHaveLength(1);
  });
});
