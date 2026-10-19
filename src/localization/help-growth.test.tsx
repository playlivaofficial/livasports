import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/v2/Header',()=>({V2Header:()=>null}));
import {HelpPage,helpArticleSchema,helpMetadata} from './HelpPage';
import {helpContent,helpReviewDate} from './help-content';
import {helpKinds,helpPath} from './help-routes';
import {interfaceLocales,languageTags} from './interface';
import {editorialSitemapClusters} from '@/v2/seo';
import {v2Path} from '@/v2/routes';
describe('retained evergreen guides in V2',()=>{
 it.each(interfaceLocales)('%s retains useful canonical content without live-data promises',locale=>{
  const urls=editorialSitemapClusters().flatMap(cluster=>Object.values(cluster));
  for(const kind of helpKinds){
   const path=helpPath(locale,kind),slug=path.split('/')[2],html=renderToStaticMarkup(<HelpPage locale={locale} slug={slug}/>);
   const schema=helpArticleSchema(locale,kind),metadata=helpMetadata(locale,slug);
   expect(urls).toContain('https://livasports.com'+path);expect(html.match(/<h1>/g)).toHaveLength(1);
   expect(html).toContain('dateTime="'+helpReviewDate(locale,kind)+'"');expect(schema.inLanguage).toBe(languageTags[locale]);
   expect(metadata.alternates?.canonical).toBe(path);expect(JSON.stringify(schema)).not.toMatch(/"aggregateRating"|"offers"|"Person"|"datePublished"/);
   expect(html).not.toMatch(/href="\/go\/|competition=.*tab=standings|href=".*(?:partidos\/hoy|matches\/today)/);
   expect(html).toContain(v2Path(locale,'tools',kind==='favorites'?'lineup-builder':'odds-calculator'));
  }
 });
 it.each(['mx','co','pe'] as const)('%s preserves actual market education',locale=>{
  const article=JSON.stringify(helpContent[locale].markets);expect(article).toContain('3–0');expect(article).toContain('1–1');expect(article).toContain('2.5');
  expect(helpContent[locale].comparison.sections.some(section=>section.body.includes('ya no obtiene ni muestra cotizaciones en vivo'))).toBe(true);
 });
 it('uses the actual content review date, not daily artificial freshness',()=>{for(const locale of interfaceLocales)for(const kind of helpKinds)expect(helpReviewDate(locale,kind)).toBe('2026-10-19');});
});
