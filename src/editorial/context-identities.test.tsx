import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {identityRegistry,storyContext} from './context';
import {StoryContext,domesticLeagueContext} from './StoryContext';
import {previewNews} from './seed';
import type {SportsSnapshot} from '@/multisport/model';
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'League',sourceId:'openligadb',sourceUrl:'https://www.openligadb.de/',observedAt:'2026-10-25',retrievedAt:'2026-10-26T06:00:00Z',mode:'manual',entities:[{id:'bayern',name:'FC Bayern München',kind:'club'},{id:'unlicensed',name:'Synthetic Unlicensed',kind:'club'}],events:[],tables:[]};
const story={...previewNews[0],competition:'bundesliga' as const,sport:'football' as const,title:{en:'FC Bayern München update',es:'FC Bayern München actualización',pt:'FC Bayern München atualização'},body:{en:'FC Bayern München and Synthetic Unlicensed.',es:'FC Bayern München y Synthetic Unlicensed.',pt:'FC Bayern München e Synthetic Unlicensed.'}};
describe('source-qualified article identities, synthetic rendering only',()=>{
 it('uses only the existing reviewed asset registry and preserves provenance',()=>{const [approved,missing]=identityRegistry([snapshot]);expect(approved.assetStatus).toBe('reviewed-editorial-artwork');expect(approved.asset?.source).toContain('commons.wikimedia.org');expect(approved.asset?.sha256).toHaveLength(64);expect(missing.asset).toBeNull();expect(missing.assetStatus).toBe('text-only-rights-unverified');});
 it.each(['en','mx','br'] as const)('renders canonical links, actual approved art and an honest text fallback in %s',locale=>{const $=load(renderToStaticMarkup(<StoryContext story={story} snapshots={[snapshot]} locale={locale}/>));expect($('a[data-artwork=reviewed-editorial] img').attr('src')).toBe('/sports-identities/bayern.png');expect($('a[data-artwork=text-only] img')).toHaveLength(0);expect($('.ed-text-identity').text()).toBe('SU');expect($('a[data-artwork]').map((_,e)=>$(e).attr('href')).get().every(h=>h.startsWith('/'+locale+'/')&&h.includes('/entities/'))).toBe(true);expect($.text()).toContain('2026-10-25');expect($('a[href^="/go/"]')).toHaveLength(0);});
 it('does not infer opponents, scores, lookalike names or cross-competition art',()=>{expect(storyContext(story,[snapshot])?.event).toBeNull();expect(storyContext({...story,competition:'liga-mx'},[snapshot])).toBeNull();expect(identityRegistry([{...snapshot,competitionId:'liga-mx'}])[0].asset).toBeNull();const near={...story,body:{en:'FC Bayern Münchenn',es:'FC Bayern Münchenn',pt:'FC Bayern Münchenn'},title:{en:'Update',es:'Actualización',pt:'Atualização'}};expect(storyContext(near,[snapshot])?.entities).toHaveLength(0);});
 it('selects the current Colombian edition before an old archive with a newer edit timestamp',()=>{
  const make=(mode:'manual'|'historical',season:string,date:string):SportsSnapshot=>({...snapshot,competitionId:'colombia-primera-a',mode,season,observedAt:date,entities:[{id:'america',name:'América de Cali',kind:'club'}],tables:[{type:'football',id:'league',name:'League',stage:'Finalización',rows:[{entityId:'america',rank:2,played:14,won:8,drawn:4,lost:2,goalsFor:23,goalsAgainst:10,goalDifference:13,points:28}]}]});
  const current=make('manual','2026 Finalizacion','2026-10-21'),archive=make('historical','2025','2026-10-25');
  const cup={...story,competition:'copa-colombia' as const,country:'co' as const,title:{en:'América de Cali qualifies',es:'América de Cali',pt:'América de Cali'}};
  expect(domesticLeagueContext(cup,[archive,current])?.snapshot).toBe(current);
 });
});
