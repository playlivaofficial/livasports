import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {leaguePulse,LeaguePulse} from './LeaguePulse';
import type {SportsSnapshot} from './model';
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026',stage:'league',sourceId:'openligadb',sourceUrl:'https://www.openligadb.de/',observedAt:'2026-10-18T15:30:00Z',retrievedAt:'2026-10-21T06:00:00Z',mode:'manual',entities:[{id:'a',name:'FC Bayern München',kind:'club'},{id:'b',name:'Borussia Dortmund',kind:'club'}],tables:[],events:[{id:'one',homeId:'a',awayId:'b',stage:'league',start:'2026-10-17T12:00:00Z',status:'completed',scores:{home:2,away:1}}]};
describe('source-backed league notebook',()=>{
 it('derives only recorded completed results before cutoff',()=>{
  const result=leaguePulse({...snapshot,events:[...snapshot.events,{...snapshot.events[0],id:'future',start:'2026-10-19T12:00:00Z'},{...snapshot.events[0],id:'live',status:'live'},{...snapshot.events[0],id:'unknown',awayId:'missing'},{...snapshot.events[0],id:'no-score',scores:null}]});
  expect(result?.completed).toBe(1);expect(result?.goals).toBe(3);expect(result?.recent.map(e=>e.id)).toEqual(['one']);
 });
 it('does not invent notebook content for unavailable or other-sport data',()=>{expect(leaguePulse({...snapshot,events:[]})).toBeNull();expect(leaguePulse({...snapshot,sport:'basketball'})).toBeNull();});
 it.each(['en','mx','br'] as const)('renders real identities and dated context in %s',locale=>{const html=renderToStaticMarkup(<LeaguePulse snapshot={snapshot} locale={locale}/>);expect(html).toContain('2026-10-18');expect(html).toContain('bayern.png');expect(html).toContain('dortmund.png');expect(html).toContain('#source');expect(html).not.toContain('/go/');});
});
