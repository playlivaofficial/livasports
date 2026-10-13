import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/components/sports/SiteHeader',()=>({SiteHeader:()=>null}));
import {HelpPage,helpArticleSchema,helpMetadata} from './HelpPage';
import {SiteFooter} from './LegalPage';
import {helpContent,helpReviewDate} from './help-content';
import {helpKinds,helpPath} from './help-routes';
import {interfaceLocales,languageTags} from './interface';
import {primarySitemap} from '@/seo/sitemap';
import {minusTenPercent} from '@/odds/calculated-estimate';

describe('evergreen football discovery and price transparency',()=>{
 it('gives every guide a crawlable inbound link, unique canonical and consistent review date',()=>{
  const rows=primarySitemap(null);
  for(const locale of interfaceLocales){
   const footer=renderToStaticMarkup(<SiteFooter locale={locale}/>);
   for(const kind of helpKinds){
    const path=helpPath(locale,kind),slug=path.split('/')[2],html=renderToStaticMarkup(<HelpPage locale={locale} slug={slug}/>);
    const schema=helpArticleSchema(locale,kind),metadata=helpMetadata(locale,slug),row=rows.find(r=>r.url==='https://livasports.com'+path);
    expect(footer).toContain(`href="${path}"`);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain(`dateTime="${helpReviewDate(locale,kind)}"`);
    expect(schema.inLanguage).toBe(languageTags[locale]);expect(schema.mainEntityOfPage).toBe(row?.url);
    expect(schema.dateModified).toBe(row?.lastModified?new Date(row.lastModified).toISOString().slice(0,10):undefined);
    expect(schema.image.every(url=>url.startsWith('https://livasports.com/'))).toBe(true);
    expect(metadata.alternates?.canonical).toBe(path);
    expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|offers|Person|datePublished/);
   }
  }
 });
 it.each([['mx','liga-mx'],['co','colombia-primera-a'],['pe','peru-liga-1']] as const)('connects %s readers to the right domestic fixture, results and standings hub', (locale,competition)=>{
  for(const kind of ['comparison','markets','slipComparison'] as const){
   const html=renderToStaticMarkup(<HelpPage locale={locale} slug={helpPath(locale,kind).split('/')[2]}/>);
   expect(html).toContain(`href="/${locale}/futbol?competition=${competition}"`);
   expect(html).toContain(`competition=${competition}&amp;tab=results`);
   expect(html).toContain(`competition=${competition}&amp;tab=standings`);
   expect(html).not.toMatch(/href="\/go\/|data-affiliate|utm_/);
  }
 });
 it('explains the exact fallback example without changing bookmaker prices or admission logic',()=>{
  expect(minusTenPercent('1.95')).toBe('1.755');
  for(const locale of ['mx','co','pe'] as const){
   const article=JSON.stringify(helpContent[locale].slipComparison);
   expect(article).toContain('≈1.76');expect(article).toContain('Nunca se calcula una estimación a partir de otra');
   expect(article).toContain('no habilita una apuesta a ese precio');
   expect(helpContent[locale].markets.sections.find(s=>s.title.includes('Ambos'))?.body).toContain('3–0');
  }
 });
 it('removes the obsolete universal quote lifetime and preserves untouched favorites dates',()=>{
  for(const locale of interfaceLocales){
   expect(helpContent[locale].comparison.sections[locale==='br'?4:0].body).not.toMatch(/older than 15 minutes|con más de 15 minutos|com mais de 15 minutos/);
   expect(helpReviewDate(locale,'favorites')).toBe('2026-09-17');
  }
 });
});
