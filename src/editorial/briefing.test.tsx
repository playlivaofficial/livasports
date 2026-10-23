import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {HomeBriefing} from './NewsCards';
import {previewNews} from './seed';
const now=new Date('2026-10-19T12:00:00Z');
describe('real homepage briefing',()=>{
 it('shows at most three crawlable dated stories and excludes the lead',()=>{const $=load(renderToStaticMarkup(<HomeBriefing items={previewNews} locale="en" exclude={previewNews[0].slug} now={now}/>));expect($('li').length).toBeLessThanOrEqual(3);expect($('li time').length).toBe($('li').length);expect($(`li a[href$="${previewNews[0].slug}"]`)).toHaveLength(0);expect($('img,.ed-story-mark')).toHaveLength(0);});
 it('never invents a briefing when there are no eligible publications',()=>{expect(renderToStaticMarkup(<HomeBriefing items={[]} locale="en" now={now}/>)).toBe('');expect(renderToStaticMarkup(<HomeBriefing items={previewNews.map(item=>({...item,sourcePublishedOn:'2027-01-01'}))} locale="en" now={now}/>)).toBe('');});
 it('keeps the ES/EN/PT interface and real source dates',()=>{for(const locale of ['en','mx','br'] as const){const $=load(renderToStaticMarkup(<HomeBriefing items={previewNews} locale={locale} now={now}/>));expect($('li a').first().attr('href')).toMatch(new RegExp('^/'+locale+'/'));expect($('li time').first().attr('datetime')).toMatch(/^2026-/);}});
});
