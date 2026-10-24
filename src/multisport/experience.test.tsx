import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import type {SportsSnapshot} from './model';
import type {PublishedNews} from '@/editorial/model';
import {canonicalEntity,newsForEntity,newsForCompetition,recordedResults,tableMemberships} from './experience-model';
import {CompetitionExperience,EntityExperience} from './CompetitionExperience';
import {competitionById} from './catalog';
vi.mock('./local-preview',()=>({localDataPreviewEnabled:()=>false}));
const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'colombia-primera-a',sport:'football',season:'2026 Finalizacion',stage:'Torneo Finalización',sourceId:'wikimedia',sourceUrl:'https://en.wikipedia.org/wiki/2026_Categor%C3%ADa_Primera_A_season',observedAt:'2026-10-21',retrievedAt:'2026-10-22T12:00:00Z',mode:'manual',entities:[{id:'club-a',name:'América de Cali',kind:'club'},{id:'club-b',name:'Test other club',kind:'club'}],tables:[{id:'final',name:'Finalización',stage:'Finalización',type:'football',rows:[{entityId:'club-a',rank:2,played:14,won:8,drawn:4,lost:2,goalsFor:20,goalsAgainst:10,goalDifference:10,points:28}]}],events:[]};
const tr=(value:string)=>({en:value,es:value,pt:value});
const story:PublishedNews={slug:'test-america',competition:'copa-colombia',country:'co',sport:'football',title:tr('América de Cali qualifies for the semi-finals'),summary:tr('TEST summary'),body:tr('TEST renderer fixture only'),sourceName:'DIMAYOR',sourceUrl:'https://dimayor.com.co/test',sourcePublishedOn:'2026-10-21',image:'none',imageCaption:tr(''),featured:false,publishedAt:'2026-10-22T12:00:00Z',updatedAt:'2026-10-22T12:00:00Z',verifiedAt:'2026-10-22T12:00:00Z'};
describe('Batch 1 source-bound competition experiences',()=>{
 story.summary=tr('Renderer-only test summary with sufficient text for the unchanged publication gate.');
 story.body=tr('Renderer-only synthetic article body for testing source-bound card relationships; never published.');
 it('connects explicit league/cup identity without fuzzy name or cross-sport matching',()=>{
  expect(canonicalEntity('colombia-primera-a',snapshot.entities[0])).toBe(canonicalEntity('copa-colombia',{id:'another-source',name:'America de Cali'}));
  expect(newsForEntity(story,snapshot,snapshot.entities[0])).toBe(true);
  expect(newsForCompetition(story,snapshot)).toBe(true);
  expect(newsForEntity({...story,sport:'basketball'},snapshot,snapshot.entities[0])).toBe(false);
  expect(newsForEntity({...story,title:tr('América de California update')},snapshot,snapshot.entities[0])).toBe(false);
  expect(newsForEntity(story,snapshot,snapshot.entities[1])).toBe(false);
  expect(canonicalEntity('liga-mx',{id:'different',name:'América de Cali'})).not.toBe('america-de-cali');
 });
 it('only shows completed recorded results with known participants before the actual source cutoff',()=>{
  const event={id:'result',stage:'Round',homeId:'club-a',awayId:'club-b',start:'2026-10-20T12:00:00Z',status:'completed' as const,scores:{home:2,away:1}};
  const s={...snapshot,events:[event,{...event,id:'future',start:'2026-10-25T12:00:00Z'},{...event,id:'scheduled',status:'scheduled' as const},{...event,id:'missing-team',awayId:'missing'},{...event,id:'missing-score',scores:null}]};
  expect(recordedResults(s).map(e=>e.id)).toEqual(['result']);expect(recordedResults(s,'absent')).toEqual([]);
  expect(s.events).toHaveLength(5);
 });
 it.each(['en','mx','br'] as const)('renders actual snapshot facts, precise source date, linked teams and related cup news in %s',locale=>{
  const $=load(renderToStaticMarkup(<CompetitionExperience snapshot={snapshot} competition={competitionById(snapshot.competitionId)!} locale={locale} news={[story]}/>));
  expect($('h1').text()).toBe('Liga BetPlay DIMAYOR');expect($('.cx-header').text()).toContain('2026 Finalizacion');
  expect($('.cx-date time').attr('datetime')).toBe('2026-10-21');expect($('.ms-table tbody tr')).toHaveLength(1);
  expect($('.cx-team-card')).toHaveLength(2);expect($('.cx-team-card').first().attr('href')).toContain('/season/2026-finalizacion/entities/club-a');
  expect($('#coverage').text()).toContain('América de Cali');expect($('#events .cx-result')).toHaveLength(0);
  expect($('.ms-source-links a').first().attr('href')).toBe(snapshot.sourceUrl);
 });
 it('groups NHL by source conferences and divisions, without inventing an overall rank or regulation wins',()=>{
  const hockey:SportsSnapshot={...snapshot,competitionId:'nhl',sport:'ice-hockey',stage:'Regular season',tables:['Eastern','Western'].map((conference,index)=>({id:String(index),name:conference,conference,division:index?'Pacific':'Atlantic',stage:'Regular season',type:'ice-hockey',rows:[{entityId:index?'club-b':'club-a',rank:1,played:5,wins:3,losses:1,overtimeLosses:1,points:7,goalsFor:15,goalsAgainst:12}]}))};
  const $=load(renderToStaticMarkup(<CompetitionExperience snapshot={hockey} competition={competitionById('nhl')!} locale="en" news={[]}/>));
  expect($('.cx-conference')).toHaveLength(2);expect($('.ms-table-ice-hockey')).toHaveLength(2);
  expect($('.cx-header-art .cx-nameplate').text()).toBe('NHL');
  expect($('.cx-filters button').map((_,n)=>$(n).text()).get()).toEqual(['All divisions','Eastern','Western']);
  expect($('thead').text()).toContain('OTL');expect($('thead').text()).not.toContain('RW');
 });
 it('keeps entity records season-bound, with real values and no invented fixtures',()=>{
  const $=load(renderToStaticMarkup(<EntityExperience snapshot={snapshot} competition={competitionById(snapshot.competitionId)!} entity={snapshot.entities[0]} locale="en" news={[story]} allSnapshots={[snapshot]}/>));
  expect($('h1').text()).toBe('América de Cali');expect($('.cx-record').text()).toContain('PTS28');expect($('.ms-table tbody tr')).toHaveLength(1);
  expect($('.cx-full-table').attr('href')).toContain('/season/2026-finalizacion#standings');expect($('#coverage').text()).toContain('semi-finals');
  expect(tableMemberships(snapshot,'absent')).toEqual([]);
 });
 it('preserves theme-aware selected filters and 44px source controls',()=>{
  const css=readFileSync(new URL('./competition-experience.css',import.meta.url),'utf8');
  expect(css).toContain('.cx-filters button[aria-pressed=true]{background:var(--cx-accent);color:var(--v2-surface);');
  expect(css).toContain('.cx-header-foot .cx-date a{min-height:44px}');
  expect(css).not.toContain('min-height:40px');
 });
});
