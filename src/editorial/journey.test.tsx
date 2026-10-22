import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {load} from 'cheerio';
import {HomeSportsNav} from './HomeSportsNav';
import {StoryContext,domesticLeagueContext} from './StoryContext';
import {StandingsWorkbench} from '@/multisport/StandingsWorkbench';
import type {SportsSnapshot} from '@/multisport/model';
import type {PublishedNews} from './model';
const text={en:'América de Cali qualifies',es:'América de Cali clasifica',pt:'América de Cali se classifica'};
const story:PublishedNews={slug:'test-announcement',country:'co',competition:'copa-colombia',sport:'football',title:text,summary:text,body:text,sourceName:'DIMAYOR',sourceUrl:'https://dimayor.com.co/',sourcePublishedOn:'2026-10-22',image:'none',imageCaption:{en:'',es:'',pt:''},featured:true,publishedAt:'2026-10-22T10:00:00Z',updatedAt:'2026-10-22T10:00:00Z',verifiedAt:'2026-10-22T10:00:00Z'};
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'colombia-primera-a',sport:'football',season:'2026 Finalizacion',stage:'Torneo Finalización',sourceId:'wikipedia-cc-by-sa',sourceUrl:'https://en.wikipedia.org/wiki/2026_Liga_DIMAYOR',observedAt:'2026-10-21',retrievedAt:'2026-10-22T10:00:00Z',mode:'manual',entities:[{id:'america',name:'América de Cali',kind:'club'}],tables:[{type:'football',id:'league',name:'League',stage:'league',rows:[{entityId:'america',rank:2,played:14,won:8,drawn:4,lost:2,goalsFor:23,goalsAgainst:10,goalDifference:13,points:28}]}],events:[]};
describe('complete sports journey',()=>{
 it.each(['en','mx','br'] as const)('exposes seven actual sport routes and no public GEO chooser in %s',locale=>{
  const $=load(renderToStaticMarkup(<HomeSportsNav locale={locale}/>));
  expect($('.sw-all-sports a')).toHaveLength(7);expect(new Set($('.sw-all-sports a').map((_,e)=>$(e).attr('href')).get()).size).toBe(7);
  expect($('select')).toHaveLength(0);expect($('.sw-all-sports summary').text()).toContain('7');
 });
 it('keeps dated domestic context explicitly separate from cup facts',()=>{
  const $=load(renderToStaticMarkup(<StoryContext story={story} snapshots={[snapshot]} locale="en"/>));
  expect($('.sw-club-context dd').map((_,e)=>$(e).text()).get()).toEqual(['2','14','28']);
  expect($.text()).toContain('separate from the cup');expect($.text()).toContain('2026-10-21');
  expect($('a[href*="colombia-primera-a"]')).toHaveLength(2);expect($('a[href^="/go/"]')).toHaveLength(0);
 });
 it('does not invent a club association, table or event',()=>{
  expect(domesticLeagueContext(story,[])).toBeNull();
  expect(domesticLeagueContext({...story,country:'mx'},[snapshot])).toBeNull();
  expect(domesticLeagueContext({...story,title:{...text,en:'Another club qualifies'}},[snapshot])).toBeNull();
  expect(domesticLeagueContext(story,[{...snapshot,tables:[]}])).toBeNull();
 });
 it('renders sourced tabs and one table without duplicating every league table',()=>{
  const $=load(renderToStaticMarkup(<StandingsWorkbench snapshots={[snapshot,{...snapshot,competitionId:'bundesliga'}]} locale="en"/>));
  expect($('[role=tab]')).toHaveLength(2);expect($('[role=tab][aria-selected=true]')).toHaveLength(1);expect($('[role=tabpanel] table')).toHaveLength(1);
  expect($.text()).toContain('21 Oct 2026');expect($('details summary').text()).toContain('Source');
 });
});
