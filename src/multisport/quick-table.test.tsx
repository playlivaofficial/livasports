import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {load} from 'cheerio';
import {QuickTable} from './QuickTable';
import type {SportsSnapshot} from './model';
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'league',sourceId:'openligadb',sourceUrl:'https://www.openligadb.de/',observedAt:'2026-10-18T15:30:00Z',retrievedAt:'2026-10-21T06:00:00Z',mode:'manual',entities:[{id:'bayern',name:'FC Bayern München',kind:'club'}],tables:[{type:'football',id:'league',name:'League',stage:'league',rows:[{entityId:'bayern',rank:1,played:6,won:4,drawn:2,lost:0,goalsFor:15,goalsAgainst:4,goalDifference:11,points:14}]}],events:[]};
describe('published standings first-fold doorway',()=>{
 it.each(['en','mx','br'] as const)('preserves source date, exact values and localized links in %s',locale=>{
  const $=load(renderToStaticMarkup(<QuickTable snapshot={snapshot} locale={locale}/>));
  expect($('time').attr('datetime')).toBe(snapshot.observedAt);expect($('li b').text()).toBe('14');expect($('.sp-played').text()).toBe('6');
  expect($('li a').attr('href')).toContain('/'+locale+'/');expect($('img[src="/sports-identities/bayern.png"]')).toHaveLength(1);expect($('a[href^="/go/"]')).toHaveLength(0);
 });
 it('renders nothing rather than inventing a table',()=>{expect(renderToStaticMarkup(<QuickTable snapshot={{...snapshot,tables:[]}} locale="en"/>)).toBe('');});
 it('does not label old records live',()=>{expect(renderToStaticMarkup(<QuickTable snapshot={snapshot} locale="en"/>)).toContain('not live');});
});
