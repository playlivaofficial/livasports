import {describe,expect,it} from 'vitest';
import {load} from 'cheerio';
import {interfaceLocales,languageTags} from '@/localization/interface';
import {editorialSitemapXml} from '@/v2/seo';
import {previewNews} from '@/editorial/seed';
import {validateSnapshot,type SportsSnapshot} from './model';
import {snapshotEntityHasIndexableContent,snapshotHasIndexableContent,sportsSitemapClusters} from './seo';
import {snapshotSeasonToken,translateSportsPath} from './catalog';
import {WIKIMEDIA_DATASETS} from './wikimedia-datasets';

const NOW=new Date('2026-10-19T12:00:00Z');
/** Synthetic fixture for sitemap tests only. Never ingested or used by production pages. */
function fixture():SportsSnapshot{
 return {
  schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'regular-season',
  sourceId:'openligadb',sourceUrl:'https://api.openligadb.de/getbltable/bl1/2026',
  observedAt:'2026-10-18T18:00:00Z',retrievedAt:'2026-10-19T10:00:00Z',mode:'manual',
  entities:[{id:'test-alpha',name:'Synthetic Alpha',kind:'club'},{id:'test-beta',name:'Synthetic Beta',kind:'club'}],
  tables:[{type:'football',id:'test-table',name:'Synthetic table',stage:'regular-season',rows:[
   {entityId:'test-alpha',rank:1,played:1,won:1,drawn:0,lost:0,goalsFor:2,goalsAgainst:1,goalDifference:1,points:3},
   {entityId:'test-beta',rank:2,played:1,won:0,drawn:0,lost:1,goalsFor:1,goalsAgainst:2,goalDifference:-1,points:0},
  ]}],
  events:[{id:'test-event',stage:'regular-season',homeId:'test-alpha',awayId:'test-beta',start:'2026-10-18T14:00:00Z',status:'completed',scores:{home:2,away:1}}],
 };
}
function oldSeason(){
 const old=fixture();old.season='2025/26';old.sourceUrl='https://api.openligadb.de/getbltable/bl1/2025';old.observedAt='2026-05-20T18:00:00Z';old.events[0].start='2026-05-18T14:00:00Z';
 old.entities[0].id='test-old-alpha';old.tables[0].rows[0].entityId='test-old-alpha';old.events[0].homeId='test-old-alpha';
 return old;
}

describe('published snapshot sitemap quality gate',()=>{
 it('emits nothing for a manifest alone or unsupported source records',()=>{
  expect(sportsSitemapClusters([],NOW)).toEqual([]);
  const snapshot=fixture();snapshot.sourceId='nba';
  expect(sportsSitemapClusters([snapshot],NOW)).toEqual([]);
  expect(snapshotHasIndexableContent(snapshot,NOW)).toBe(false);
 });
 it('emits competition, season and recorded entities with exact observation dates and reciprocal localized paths',()=>{
  const snapshot=fixture();expect(validateSnapshot(snapshot,NOW)).toEqual([]);
  const clusters=sportsSitemapClusters([snapshot],NOW);
  expect(clusters).toHaveLength(4);
  expect(clusters.map(item=>item.paths.en)).toEqual([
   'https://livasports.com/en/sports/football/bundesliga',
   'https://livasports.com/en/sports/football/bundesliga/season/2026-27',
   'https://livasports.com/en/sports/football/bundesliga/season/2026-27/entities/test-alpha',
   'https://livasports.com/en/sports/football/bundesliga/season/2026-27/entities/test-beta',
  ]);
  for(const item of clusters){expect(item.lastmod).toBe(snapshot.observedAt);expect(Object.keys(item.paths)).toEqual([...interfaceLocales]);expect(item.paths.br).toContain('/br/esportes/football/');expect(item.paths.mx).toContain('/mx/deportes/football/');}
 });
 it('rejects entity-only, one-row-only, all-zero and undated fixture-only pages',()=>{
  const entityOnly=fixture();entityOnly.tables=[];entityOnly.events=[];
  const oneRow=fixture();oneRow.tables[0].rows.pop();oneRow.events=[];
  const zero=fixture();zero.events=[];
  if(zero.tables[0].type==='football')for(const row of zero.tables[0].rows)Object.assign(row,{played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,goalDifference:0,points:0});
  const undated=fixture();undated.tables=[];Object.assign(undated.events[0],{start:null,status:'scheduled',scores:null});
  for(const snapshot of [entityOnly,oneRow,zero,undated]){expect(snapshotHasIndexableContent(snapshot,NOW)).toBe(false);expect(sportsSitemapClusters([snapshot],NOW)).toEqual([]);}
  for(const snapshot of [oneRow,zero,undated])expect(validateSnapshot(snapshot,NOW)).toEqual([]);
 });
 it('allows a dated single cup result or confirmed fixture, without manufacturing a kickoff time',()=>{
  const snapshot=fixture();snapshot.tables=[];snapshot.events[0].start=null;snapshot.events[0].date='2026-10-18';
  expect(snapshotHasIndexableContent(snapshot,NOW)).toBe(true);
  Object.assign(snapshot.events[0],{date:'2026-10-25',status:'scheduled',scores:null});
  expect(snapshotHasIndexableContent(snapshot,NOW)).toBe(true);
  for(const status of ['cancelled','postponed'] as const){snapshot.events[0].status=status;expect(snapshotHasIndexableContent(snapshot,NOW)).toBe(false);}
 });
 it('excludes future/invalid observed times and never substitutes retrieval time',()=>{
  for(const observedAt of ['bad','2026-10-20T00:00:00Z','2026-02-30T00:00:00Z']){
   const snapshot=fixture();snapshot.observedAt=observedAt;expect(sportsSitemapClusters([snapshot],NOW)).toEqual([]);
  }
  expect(sportsSitemapClusters([fixture()],new Date('invalid'))).toEqual([]);
  const snapshot=fixture();snapshot.retrievedAt=NOW.toISOString();
  expect(sportsSitemapClusters([snapshot],NOW).every(item=>item.lastmod===snapshot.observedAt)).toBe(true);
 });
 it('preserves date-only historical observation precision',()=>{
  const snapshot=fixture();snapshot.mode='historical';snapshot.observedAt='2026-10-18';
  expect(sportsSitemapClusters([snapshot],NOW)).toHaveLength(4);
  expect(sportsSitemapClusters([snapshot],NOW).every(item=>item.lastmod==='2026-10-18')).toBe(true);
 });
 it('keeps historical entity records on their own season-scoped canonical paths',()=>{
  const current=fixture(),old=oldSeason();expect(validateSnapshot(old,NOW)).toEqual([]);
  const clusters=sportsSitemapClusters([old,current,current,old],NOW),urls=clusters.map(item=>item.paths.en);
  expect(urls).toHaveLength(7);expect(new Set(urls).size).toBe(urls.length);
  expect(urls).toContain('https://livasports.com/en/sports/football/bundesliga/season/2025-26');
  expect(urls).toContain('https://livasports.com/en/sports/football/bundesliga/season/2025-26/entities/test-old-alpha');
  expect(urls.some(url=>url.includes('/bundesliga/entities/'))).toBe(false);
  expect(clusters.find(item=>item.paths.en.endsWith('2025-26'))?.lastmod).toBe(old.observedAt);
 });
 it('does not fall back to old competition/entity records when the newest published season is thin',()=>{
  const current=fixture();current.tables=[];Object.assign(current.events[0],{start:null,status:'scheduled',scores:null});
  const urls=sportsSitemapClusters([oldSeason(),current],NOW).map(item=>item.paths.en);
  expect(urls).toEqual([
   'https://livasports.com/en/sports/football/bundesliga/season/2025-26',
   'https://livasports.com/en/sports/football/bundesliga/season/2025-26/entities/test-beta',
   'https://livasports.com/en/sports/football/bundesliga/season/2025-26/entities/test-old-alpha',
  ]);
 });
 it('does not let a later archive source edit replace the catalog edition root',()=>{
  const current=fixture(),old=oldSeason();old.mode='historical';old.observedAt='2026-10-19T09:00:00Z';
  const clusters=sportsSitemapClusters([old,current],NOW);
  expect(clusters.find(item=>item.paths.en.endsWith('/bundesliga'))?.lastmod).toBe(current.observedAt);
  expect(clusters.find(item=>item.paths.en.endsWith('/season/2025-26'))?.lastmod).toBe(old.observedAt);
  current.tables=[];Object.assign(current.events[0],{start:null,status:'scheduled',scores:null});
  expect(sportsSitemapClusters([old,current],NOW).some(item=>item.paths.en.endsWith('/bundesliga'))).toBe(false);
 });
 it('uses the shared Liga MX season token with reciprocal localized entity paths and real date precision',()=>{
  const config=WIKIMEDIA_DATASETS.find(item=>item.competitionId==='liga-mx')!;
  const snapshot=fixture();Object.assign(snapshot,{competitionId:config.competitionId,season:config.season,sourceId:'wikimedia',sourceUrl:config.sourceUrl,observedAt:'2026-10-18',observationBasis:'data-date',provenance:[{title:config.titles[0],revisionId:123,revisionTimestamp:'2026-10-19T03:48:30Z',dataAsOf:'2026-10-18'}],events:[]});
  expect(validateSnapshot(snapshot,NOW)).toEqual([]);
  const token=snapshotSeasonToken(snapshot.season);expect(token).toBe('apertura-2026-2026-2027');
  const clusters=sportsSitemapClusters([snapshot],NOW);
  expect(clusters).toHaveLength(4);
  expect(clusters.some(item=>item.paths.en.endsWith(`/season/${token}/entities/test-alpha`))).toBe(true);
  for(const item of clusters){
   expect(item.lastmod).toBe('2026-10-18');expect(item.paths.en).not.toMatch(/%20|%28|%29|\s/);
   for(const locale of interfaceLocales)expect(translateSportsPath(new URL(item.paths.en).pathname,locale)).toBe(new URL(item.paths[locale]).pathname);
  }
 });
 it('excludes unused entity metadata and safely encodes supported identifiers',()=>{
  const snapshot=fixture();snapshot.entities.push({id:'unused',name:'Synthetic unused club',kind:'club'});
  snapshot.entities[0].id='test:Alpha.1';snapshot.tables[0].rows[0].entityId='test:Alpha.1';snapshot.events[0].homeId='test:Alpha.1';
  expect(snapshotEntityHasIndexableContent(snapshot,'unused',NOW)).toBe(false);
  expect(snapshotEntityHasIndexableContent(snapshot,'test:Alpha.1',NOW)).toBe(true);
  const urls=sportsSitemapClusters([snapshot],NOW).map(item=>item.paths.en);
  expect(urls.some(url=>url.endsWith('/test%3AAlpha.1'))).toBe(true);expect(urls.some(url=>url.endsWith('/unused'))).toBe(false);
 });
 it('retains published news dates and full hreflang clusters alongside sports records',()=>{
  const news=previewNews.slice(0,1),snapshot=fixture();expect(news).toHaveLength(1);
  const $=load(editorialSitemapXml(news,[snapshot],NOW),{xmlMode:true});
  const locations=$('loc').toArray().map(node=>$(node).text());expect(new Set(locations).size).toBe(locations.length);
  const newsUrls=$('url').filter((_,node)=>$(node).find('loc').text().endsWith('/'+news[0].slug));
  expect(newsUrls).toHaveLength(5);for(const node of newsUrls.toArray())expect($(node).find('lastmod').text()).toBe(news[0].updatedAt);
  const sportsUrls=$('url').filter((_,node)=>$(node).find('loc').text().includes('/football/bundesliga'));
  expect(sportsUrls).toHaveLength(20);
  for(const node of sportsUrls.toArray()){
   expect($(node).find('lastmod').text()).toBe(snapshot.observedAt);
   const links=$(node).find('xhtml\\:link');expect(links).toHaveLength(6);
   for(const locale of interfaceLocales)expect(links.filter(`[hreflang="${languageTags[locale]}"]`).attr('href')).toContain('/'+locale+'/');
  }
  expect($('lastmod').toArray().some(node=>$(node).text()===snapshot.retrievedAt)).toBe(false);
 });
});
