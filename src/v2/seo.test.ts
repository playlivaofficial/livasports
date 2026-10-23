import {describe,it,expect} from 'vitest';
import {load} from 'cheerio';
import {editorialSitemapClusters,editorialSitemapXml} from './seo';
import {interfaceLocales,languageTags} from '@/localization/interface';
import {namespaces,translateEditorialPath,v2Path,type Section} from './routes';
import {articles} from './content';
import {competitionDisposition} from './retirement-policy';
import {sportIds,sportsPath} from '@/multisport/catalog';
describe('finite static editorial search inventory',()=>{
 it('contains unique HTTPS canonicals and no private, unverified or retired inventory',()=>{const clusters=editorialSitemapClusters(),urls=clusters.flatMap(c=>Object.values(c));expect(new Set(urls).size).toBe(urls.length);expect(urls.length).toBeGreaterThan(150);for(const url of urls){expect(url).toMatch(/^https:\/\/livasports\.com\/(en|br|mx|co|pe)/);expect(url).not.toMatch(/\/api\/|\/owner\/|\/go\/|\?|\/live$|\/en-vivo$|\/partidos\/|\/bookmakers\/|\/casas-de-apuestas\//);}});
 it('emits complete reciprocal alternates and no invented lastmod',()=>{const $=load(editorialSitemapXml(),{xmlMode:true});expect($('lastmod').length).toBe(0);for(const node of $('url').toArray()){const links=$(node).find('xhtml\\:link');expect(links.length).toBe(6);for(const locale of interfaceLocales)expect(links.filter(`[hreflang="${languageTags[locale]}"]`).attr('href')).toContain('/'+locale);}});
 it('lists canonical sports directories, not redirected V2 hubs or unsupported competition shells',()=>{
  const urls=editorialSitemapClusters().flatMap(cluster=>Object.values(cluster));
  for(const locale of interfaceLocales){
   expect(urls).toContain('https://livasports.com'+sportsPath(locale));
   for(const sport of sportIds)expect(urls).toContain('https://livasports.com'+sportsPath(locale,sport));
   for(const section of ['football','leagues'] as const)expect(urls).not.toContain('https://livasports.com'+v2Path(locale,section));
  }
  expect(urls.some(url=>/\/(leagues|ligas)\//.test(url))).toBe(false);
  expect(urls.some(url=>/\/(sports|esportes|deportes)\/[^/]+\/[^/]+/.test(url))).toBe(false);
 });
 it.each(interfaceLocales)('translates all %s article/tool routes without changing canonical content identity',locale=>{for(const section of Object.keys(namespaces.en) as Section[]){expect(translateEditorialPath(v2Path(locale,section),'en')).toBe(v2Path('en',section));}for(const article of articles)expect(translateEditorialPath(v2Path(locale,article.category,article.id),'br')).toBe(v2Path('br',article.category,article.id));});
 it('only redirects legacy hubs directly to real canonical equivalents, not results or unknown competitions',()=>{expect(competitionDisposition('co','colombia-primera-a',null)).toEqual({status:301,path:'/co/deportes/football/colombia-primera-a'});expect(competitionDisposition('mx','liga-mx','standings').status).toBe(410);expect(competitionDisposition('mx','uncovered-league',null).status).toBe(410);});
});
