import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {identityAsset} from './identity-assets';
import {BasketballDirectory} from './BasketballDirectory';
import {BasketballProfile} from './BasketballProfile';
import {StandingsTable} from './components';
import {competitionById} from './catalog';
import type {SportsSnapshot,BasketballTable} from './model';
vi.mock('./local-preview',()=>({localDataPreviewEnabled:()=>false}));

// Synthetic rendering fixture only, never a publishable sports record.
const table:BasketballTable={id:'test',name:'TEST',type:'basketball',stage:'TEST',rows:[{entityId:'test-lakers',rank:1,played:3,wins:2,losses:1,winPercentage:2/3}]};
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'nba',sport:'basketball',season:'TEST',stage:'TEST',sourceId:'test-unpublished',sourceUrl:'https://example.invalid/test',observedAt:'2026-10-26',retrievedAt:'2026-10-26',mode:'manual',entities:[{id:'test-lakers',name:'Los Angeles Lakers',kind:'club'}],tables:[table],events:[]};
describe('bounded NBA editorial artwork',()=>{
 it('uses exact franchise identities only, never another competition or a fabricated NBA mark',()=>{
  expect(identityAsset('nba','Los Angeles Lakers')?.id).toBe('lakers');
  expect(identityAsset('nba','Brooklyn Nets')?.id).toBe('nets');
  expect(identityAsset('nba','Lakers')).toBeUndefined();expect(identityAsset('nba','New Jersey Nets')).toBeUndefined();
  expect(identityAsset('euroleague','Brooklyn Nets')).toBeUndefined();expect(identityAsset('nba')).toBeUndefined();
 });
 it.each(['en','mx','br'] as const)('integrates reviewed artwork into %s tables and canonical profiles without remote optimization',locale=>{
  for(const element of [<StandingsTable key="table" table={table} snapshot={snapshot} locale={locale}/>,<BasketballProfile key="profile" snapshot={snapshot} entity={snapshot.entities[0]} competition={competitionById('nba')!} locale={locale} news={[]}/>]){
   const $=load(renderToStaticMarkup(element)),image=$('[data-identity="lakers"] img');
   expect(image.length).toBeGreaterThan(0);expect(image.first().attr('src')).toBe('/sports-identities/lakers.png');
   expect(image.first().attr('alt')).toBe('');expect(image.first().attr('style')).toContain('object-fit:contain');
   expect($('body').text()).toContain('Los Angeles Lakers');expect($('a[href^="/go/"]')).toHaveLength(0);
   expect($('img[src*="/_next/image"],img[src^="http"]')).toHaveLength(0);
  }
 });
 it('shows real artwork in existing team navigation without turning missing artwork into crests',()=>{
  const $=load(renderToStaticMarkup(<BasketballDirectory competitionId="nba" clubs={[{id:'l',name:'Los Angeles Lakers',href:'/en/sports/basketball/nba/season/TEST/entities/test-lakers'},{id:'n',name:'Brooklyn Nets'},{id:'c',name:'Boston Celtics'}]} labels={{search:'Search',all:'All',division:'Division',empty:'Empty',profile:'Profile'}}/>));
  expect($('.bk-club [data-identity="lakers"],.bk-club [data-identity="nets"]')).toHaveLength(2);
  expect($('.bk-club .cx-nameplate')).toHaveLength(1);expect($('.bk-club[href]')).toHaveLength(1);
 });
});
