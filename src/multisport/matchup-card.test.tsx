import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {MatchupCard} from './MatchupCard';
import type {SportsSnapshot,SportsEvent} from './model';
// Synthetic component fixtures only. Never persisted or used as public coverage.
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'League',sourceId:'openligadb',sourceUrl:'https://api.openligadb.de/getbltable/bl1/2026',observedAt:'2026-10-18T18:00:00Z',retrievedAt:'2026-10-19T10:00:00Z',mode:'manual',entities:[{id:'test-a',name:'Test Alpha',kind:'club'},{id:'test-b',name:'Test Beta',kind:'club'}],tables:[],events:[]};
const event:SportsEvent={id:'test-event',homeId:'test-a',awayId:'test-b',stage:'League',start:'2026-10-18T12:00:00Z',status:'completed',scores:{home:2,away:1}};
describe('source-qualified matchup card',()=>{
 it('links exact source-season identities without fabricated badges',()=>{
  const $=load(renderToStaticMarkup(<MatchupCard snapshot={snapshot} event={event} locale="en"/>));
  expect($('.ms-matchup-pair>a').map((_,a)=>$(a).text()).get()).toEqual(['Test Alpha','Test Beta']);
  expect($('.ms-matchup-pair>a').first().attr('href')).toContain('/season/2026-27/entities/test-a');
  expect($('.ms-matchup-result strong').text()).toBe('2 – 1');expect($('img')).toHaveLength(0);
 });
 it('never invents a missing opponent or displays a scheduled score',()=>{
  expect(renderToStaticMarkup(<MatchupCard snapshot={snapshot} event={{...event,awayId:'missing'}} locale="en"/>)).toBe('');
  const $=load(renderToStaticMarkup(<MatchupCard snapshot={snapshot} event={{...event,status:'scheduled'}} locale="en"/>));expect($('.ms-matchup-result strong')).toHaveLength(0);
 });
});
