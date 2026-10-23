import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {previewNews} from './seed';
import {HomeTextLead,selectTextLead,selectHomeLead} from './HomeLead';
import {reportedIdentities,StoryIdentities} from './StoryIdentities';
const now=new Date('2026-10-19T12:00:00Z');
describe('published homepage lead',()=>{
 it('does not let an older photo hide a newer verified story',()=>{
  const older={...previewNews[0],slug:'older-photo',featured:true};
  const latest={...previewNews[0],slug:'latest-text',image:'none' as const,publishedAt:'2026-10-19T11:30:00Z',updatedAt:'2026-10-19T11:30:00Z'};
  const selection=selectHomeLead([older,latest],'en',now);
  expect(selection.lead?.slug).toBe('latest-text');expect(selection.photoLead).toBeNull();
 });
 it('requires whole canonical team names, not substring matches',()=>{
  const item={...previewNews[0],competition:'copa-colombia' as const,title:{...previewNews[0].title,en:'América de Cali qualifies'}};
  expect(reportedIdentities(item).map(a=>a.id)).toEqual(['america-cali-wordmark']);
  expect(reportedIdentities({...item,title:{...item.title,en:'América de California'}})).toEqual([]);
  expect(reportedIdentities({...item,competition:'nfl'})).toEqual([]);
  const $=load(renderToStaticMarkup(<StoryIdentities item={item}/>));
  expect($('[data-identity="america-cali-wordmark"]')).toHaveLength(1);
  expect($('a[href^="/go/"]')).toHaveLength(0);
 });
 it('promotes real reviewed text without requiring decorative imagery',()=>{
  const item={...previewNews[0],image:'none' as const};
  expect(selectTextLead([item],'en',now)?.slug).toBe(item.slug);
  const $=load(renderToStaticMarkup(<HomeTextLead item={item} locale="en"/>));
  expect($('h1 a').attr('href')).toContain(item.slug);expect($('picture[data-editorial-image]')).toHaveLength(0);
  expect($('time').attr('datetime')).toBe(item.sourcePublishedOn);expect($('.ed-home-lead-source a').attr('href')).toBe(item.sourceUrl);
 });
 it('never promotes missing, future or unverified publications',()=>{
  expect(selectTextLead([],'en',now)).toBeNull();
  expect(selectTextLead([{...previewNews[0],verifiedAt:''}],'en',now)).toBeNull();
  expect(selectTextLead([{...previewNews[0],sourcePublishedOn:'2027-01-01'}],'en',now)).toBeNull();
 });
 it.each(['en','mx','br'] as const)('keeps %s routes for a published NFL category',locale=>{
  // Component-only fixture, not an actual NFL publication or public seed.
  const item={...previewNews[0],sport:'american-football' as const,competition:'nfl' as const,image:'none' as const};
  const $=load(renderToStaticMarkup(<HomeTextLead item={item} locale={locale}/>));
  expect($('.ed-lead-competition').attr('href')).toContain('/american-football/nfl');
  expect($('h1 a').attr('href')).toMatch(new RegExp('^/'+locale+'/'));expect($('img')).toHaveLength(0);
 });
});
