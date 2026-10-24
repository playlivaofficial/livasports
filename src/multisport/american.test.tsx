import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import type {SportsSnapshot,SportsTable} from './model';
import {AmericanExperience,AmericanProfile} from './AmericanExperience';
import {competitionById} from './catalog';
import {tableLabel} from './table-labels';
vi.mock('./local-preview',()=>({localDataPreviewEnabled:()=>false}));
// Synthetic records test renderer contracts only; never published.
function fixture(id:'mlb'|'nfl'|'nhl'):SportsSnapshot {
 const hockey=id==='nhl',baseball=id==='mlb',sport=hockey?'ice-hockey':baseball?'baseball':'american-football';
 const groups=hockey?['Eastern','Western']:baseball?['American League','National League']:['AFC','NFC'];
 const row={entityId:'a',rank:1,played:6,wins:3,losses:2,...(hockey?{overtimeLosses:1,points:7,goalsFor:20,goalsAgainst:15}:baseball?{played:5,winPercentage:.6,gamesBehind:0}:{ties:1,winPercentage:3.5/6,pointsFor:100,pointsAgainst:90})};
 return {schemaVersion:1,competitionId:id,sport,season:hockey?'2026/27':'2026',stage:'Regular season',sourceId:'wikimedia',sourceUrl:'https://en.wikipedia.org/wiki/2026_NFL_season',observedAt:'2026-10-20',retrievedAt:'2026-10-24T10:00:00Z',mode:baseball?'historical':'manual',...(id==='nfl'?{observationBasis:'source-revision' as const}:{}),entities:[{id:'a',name:'Test franchise A',kind:'club'},{id:'b',name:'Test franchise B',kind:'club'}],tables:groups.map((conference,i)=>({id:String(i),name:hockey?'Atlantic Division — 2026-10-20':`${baseball?'AL':'AFC'} East`,conference,division:hockey?'Atlantic':'East',stage:'Regular season',type:sport,rows:[{...row,entityId:i?'b':'a'}]} as SportsTable)),events:[]};
}
describe('American sport-specific experiences',()=>{
 for(const id of ['mlb','nfl','nhl'] as const)it.each(['en','mx','br'] as const)(`${id} preserves records and translated source-bound profiles in %s`,locale=>{
  const snapshot=fixture(id),before=JSON.stringify(snapshot),competition=competitionById(id)!,$=load(renderToStaticMarkup(<AmericanExperience competition={competition} snapshot={snapshot} locale={locale} news={[]}/>));
  expect($('h1').text()).toBe(id.toUpperCase());expect($('.cx-conference')).toHaveLength(2);expect($('.bk-club[href]')).toHaveLength(2);expect($('.ms-table tbody tr')).toHaveLength(2);expect($('.ax-postseason li')).toHaveLength(4);expect($('#events')).toHaveLength(0);expect($('a[href^="/go/"]')).toHaveLength(0);expect($('#coverage')).toHaveLength(0);
  expect($('.bk-club').first().attr('href')).toContain('/season/');expect($('.ax-date time').attr('datetime')).toBe('2026-10-20');expect(JSON.stringify(snapshot)).toBe(before);
  const p=load(renderToStaticMarkup(<AmericanProfile snapshot={snapshot} competition={competition} entity={snapshot.entities[0]} locale={locale} news={[]}/>));expect(p('h1').text()).toBe('Test franchise A');expect(p('.ms-table tbody tr')).toHaveLength(1);expect(p('.cx-full-table').attr('href')).toContain('/season/');
  if(id==='nfl'){expect(p('.cx-record dd').last().text()).toBe('58.3%');expect($('script[type="application/ld+json"]').text()).not.toContain('temporalCoverage');}
  if(id==='nhl'){expect(p('.cx-record dd').map((_,e)=>p(e).text()).get()).toEqual(['1','3','2','1','7']);expect($('thead').text()).not.toContain('RW');}
  if(id==='mlb'){expect($('.ax-header').text()).toContain(locale==='en'?'Historical':locale==='mx'?'histórico':'histórico');expect($('thead').text()).not.toContain('RF');}
 });
 it.each(['mlb','nfl','nhl'] as const)('never creates a table, team profile or data claim without a published %s record',id=>{const $=load(renderToStaticMarkup(<AmericanExperience competition={competitionById(id)!} locale="en" news={[]}/>));expect($('.ms-table,.bk-club,script[type="application/ld+json"]')).toHaveLength(0);expect($('#standings').text()).toContain('No reviewed standings');expect($('#postseason').text()).toContain('Format only');});
 it('translates a hockey directory division without requiring a date suffix',()=>{expect(tableLabel('Atlantic Division','mx')).toBe('División Atlántico');expect(tableLabel('Pacific Division — 2026-10-20','br')).toBe('Divisão Pacífico — 2026-10-20');});
});
