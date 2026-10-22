import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {ArticleHeader,RelatedStories,relatedStories} from './ArticleHeader';
import {previewNews} from './seed';
import {sportsPath,competitionPath} from '@/multisport/catalog';
import {newsSport} from './model';
const now=new Date('2026-10-19T12:00:00Z');
describe('source-backed article presentation',()=>{
 it('shows an exact reviewed club identity without inventing a matchup',()=>{
  const item={...previewNews[0],competition:'copa-colombia' as const,title:{en:'América de Cali qualifies',es:'América de Cali clasifica',pt:'América de Cali se classifica'}};
  const $=load(renderToStaticMarkup(<ArticleHeader item={item} locale="en"/>));
  expect($('[data-identity="america-cali-wordmark"]')).toHaveLength(1);
  expect($('.ed-reported-identities strong').text()).toBe('América de Cali');
  const wrong=renderToStaticMarkup(<ArticleHeader item={{...item,competition:'liga-mx'}} locale="en"/>);
  expect(wrong).not.toContain('america-cali-wordmark');
 });
 it.each(['en','mx','br'] as const)('links verified taxonomy and preserves source date in %s',locale=>{
  const item=previewNews[0],$=load(renderToStaticMarkup(<ArticleHeader item={item} locale={locale}/>));
  expect($('.ed-article-topics a').first().attr('href')).toBe(sportsPath(locale,newsSport(item)));
  expect($('.ed-article-topics a').eq(1).attr('href')).toBe(competitionPath(locale,item.competition));
  expect($('time').attr('datetime')).toBe(item.sourcePublishedOn);
  expect($('a[href="#article-source"]')).toHaveLength(1);
  expect($('img')).toHaveLength(1);expect($('img').attr('src')).toBe('/sports-identities/cruz-azul.png');expect($('h1')).toHaveLength(1);
 });
 it('does not manufacture related stories or repeat the current article',()=>{
  const item=previewNews[0];
  expect(renderToStaticMarkup(<RelatedStories item={item} items={[item,item]} locale="en" now={now}/>)).toBe('');
 });
 it('excludes future and duplicate stories, prioritizing the same competition',()=>{
  const item=previewNews[0],other={...item,slug:'related-current'},future={...item,slug:'future-story',sourcePublishedOn:'2027-01-01'};
  const result=relatedStories(item,[item,other,other,future], 'en',now);
  expect(result.map(story=>story.slug)).toEqual(['related-current']);
 });
});
