import {describe,expect,it} from 'vitest';
import {auditSitemapInventory,selectAuditPages,type AuditCluster} from '../../scripts/v2-route-inventory';
import {editorialSitemapClusters,editorialSitemapXml} from '@/v2/seo';
import {interfaceLocales,languageTags,type InterfaceLocale} from '@/localization/interface';
import {competitions,competitionPath,snapshotEntityPath,sportsPath} from './catalog';
import type {SportsSnapshot} from './model';

const NOW=Date.parse('2026-10-19T12:00:00Z'),ORIGIN='https://livasports.com';
const paths=(fn:(locale:InterfaceLocale)=>string)=>Object.fromEntries(interfaceLocales.map(locale=>[locale,ORIGIN+fn(locale)])) as Record<InterfaceLocale,string>;
const record=(cluster:AuditCluster)=>interfaceLocales.map(locale=>`<url><loc>${cluster.paths[locale]}</loc>${cluster.lastmod?`<lastmod>${cluster.lastmod}</lastmod>`:''}${interfaceLocales.map(target=>`<xhtml:link rel="alternate" hreflang="${languageTags[target]}" href="${cluster.paths[target]}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${cluster.paths.en}"/></url>`).join('');
const document=(clusters:AuditCluster[])=>editorialSitemapXml().replace('</urlset>',clusters.map(record).join('')+'</urlset>');
function dynamic():AuditCluster[]{return [
 {kind:'news',paths:paths(locale=>`/${locale}/${locale==='en'?'news':'noticias'}/synthetic-test-news`),lastmod:'2026-10-18T12:00:00Z'},
 {kind:'competition',competitionId:'bundesliga',paths:paths(locale=>competitionPath(locale,'bundesliga')),lastmod:'2026-10-18T14:00:00Z'},
 {kind:'entity',competitionId:'bundesliga',paths:paths(locale=>sportsPath(locale,'football','bundesliga','test%3AAlpha.1')),lastmod:'2026-10-18T14:00:00Z'},
 {kind:'season',competitionId:'bundesliga',paths:paths(locale=>competitionPath(locale,'bundesliga')+'/season/2025-26'),lastmod:'2026-05-18'},
 ];}

describe('complete XML audit with bounded HTML sampling',()=>{
 it('validates every localized static, news, competition, entity and historical season URL',()=>{
  const result=auditSitemapInventory(document(dynamic()),NOW);expect(result.findings).toEqual([]);
  expect(result.expected.size).toBe(editorialSitemapClusters().length*5+20);expect(result.submitted.size).toBe(result.expected.size);
 });
 it('accepts canonical season-scoped entity clusters, including Liga MX season tokens and encoded identifiers',()=>{
  const clusters:AuditCluster[]=[
   {kind:'entity',competitionId:'bundesliga',paths:paths(locale=>snapshotEntityPath(locale,{sport:'football',competitionId:'bundesliga',season:'2026/27'},'test:Alpha.1')),lastmod:'2026-10-18T14:00:00Z'},
   {kind:'entity',competitionId:'liga-mx',paths:paths(locale=>snapshotEntityPath(locale,{sport:'football',competitionId:'liga-mx',season:'Apertura 2026 (2026-2027)'},'test-beta')),lastmod:'2026-10-18'},
  ];
  const result=auditSitemapInventory(document(clusters),NOW);expect(result.findings).toEqual([]);
  expect(result.clusters.filter(item=>item.kind==='entity')).toHaveLength(2);
  expect(selectAuditPages(result.clusters).some(item=>item.cluster.paths[item.locale].includes('/season/apertura-2026-2026-2027/entities/'))).toBe(true);
 });
 it('audits the actual published-snapshot sitemap emitter, not just manually constructed route examples',()=>{
  // Synthetic test-only source fixture. It is never ingested or exposed as a real publication.
  const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:'2026/27',stage:'TEST stage',sourceId:'openligadb',sourceUrl:'https://api.openligadb.de/getbltable/bl1/2026',mode:'manual',observedAt:'2026-10-18T18:00:00Z',retrievedAt:'2026-10-19T10:00:00Z',entities:[{id:'test-alpha',name:'Synthetic TEST Alpha',kind:'club'},{id:'test-beta',name:'Synthetic TEST Beta',kind:'club'}],tables:[],events:[{id:'test-result',stage:'TEST stage',homeId:'test-alpha',awayId:'test-beta',start:'2026-10-18T14:00:00Z',status:'completed',scores:{home:1,away:0}}]};
  const result=auditSitemapInventory(editorialSitemapXml([],[snapshot],NOW),NOW);
  expect(result.findings).toEqual([]);expect(result.clusters.filter(item=>item.kind==='entity')).toHaveLength(2);
  expect(result.submitted.has(ORIGIN+'/en/sports/football/bundesliga/season/2026-27/entities/test-alpha')).toBe(true);
 });
 it('rejects missing language URLs and duplicates without losing their cluster identity',()=>{
  const body=document(dynamic()),one=record(dynamic()[0]).match(/<url>.*?<\/url>/)![0];
  expect(auditSitemapInventory(body.replace(one,''),NOW).findings.some(item=>item.problem==='MISSING_CANONICAL')).toBe(true);
  expect(auditSitemapInventory(body.replace('</urlset>',one+'</urlset>'),NOW).findings.some(item=>item.problem==='DUPLICATE_CANONICAL')).toBe(true);
 });
 it('rejects noncanonical, malformed or mismatched season-scoped entity paths',()=>{
  for(const path of ['/en/sports/football/bundesliga/season/2026-27/entities/test:Alpha.1','/en/sports/football/bundesliga/season/2026-27/entities/test%3aAlpha.1','/en/sports/football/bundesliga/season/-2026-27/entities/test-alpha','/en/sports/football/bundesliga/season/2026%2F27/entities/test-alpha','/en/sports/football/bundesliga/season/2026-27/entities/test%2Falpha','/en/sports/tennis/bundesliga/season/2026-27/entities/test-alpha','/en/sports/football/bundesliga/season/2026-27/entities/test-alpha/extra']){
   const body=editorialSitemapXml().replace('</urlset>',`<url><loc>${ORIGIN+path}</loc></url></urlset>`);
   expect(auditSitemapInventory(body,NOW).findings.some(item=>item.problem==='UNSUPPORTED_SITEMAP_ROUTE')).toBe(true);
  }
 });
 it('checks alternates on uncrawled XML entries, including exact reciprocal targets and x-default',()=>{
  const body=document(dynamic()).replace('href="https://livasports.com/br/esportes/football/bundesliga/entities/test%3AAlpha.1"','href="https://livasports.com/br/esportes/football/bundesliga"');
  expect(auditSitemapInventory(body,NOW).findings.some(item=>item.problem==='SITEMAP_HREFLANG:br')).toBe(true);
  const fallback=document(dynamic()).replace(/hreflang="x-default"/,'hreflang="de"');
  expect(auditSitemapInventory(fallback,NOW).findings.some(item=>item.problem==='SITEMAP_X_DEFAULT')).toBe(true);
 });
 it('rejects unsupported, private, redirected and noncanonical path inventory',()=>{
  for(const url of ['https://livasports.com/api/private','https://livasports.com/en/leagues/bundesliga','https://livasports.com/en/sports/football/not-real','https://livasports.com/en/sports/tennis/bundesliga','https://livasports.com/en/sports/football/bundesliga/entities/test:Alpha.1','https://evil.example/en/sports/football/bundesliga','https://livasports.com/en/sports/football/bundesliga?season=2026']){
   const body=editorialSitemapXml().replace('</urlset>',`<url><loc>${url}</loc></url></urlset>`);
   expect(auditSitemapInventory(body,NOW).findings.some(item=>item.problem==='UNSUPPORTED_SITEMAP_ROUTE')).toBe(true);
  }
 });
 it('rejects fabricated, impossible, missing, future or cross-language inconsistent lastmod',()=>{
  const staticDate=editorialSitemapXml().replace('</loc>','</loc><lastmod>2026-10-18</lastmod>');
  expect(auditSitemapInventory(staticDate,NOW).findings.some(item=>item.problem==='ARTIFICIAL_LASTMOD')).toBe(true);
  for(const lastmod of [null,'2026-02-30','2026-10-20T00:00:00Z','not-a-date']){
   const clusters=dynamic();clusters[1].lastmod=lastmod;
   expect(auditSitemapInventory(document(clusters),NOW).findings.some(item=>item.problem==='INVALID_SOURCE_LASTMOD')).toBe(true);
  }
  const body=document(dynamic()).replace('<lastmod>2026-10-18T14:00:00Z</lastmod>','<lastmod>2026-10-17T14:00:00Z</lastmod>');
  expect(auditSitemapInventory(body,NOW).findings.some(item=>item.problem==='INCONSISTENT_LASTMOD')).toBe(true);
 });
 it('fails malformed XML and unbound sitemap namespaces',()=>{
  expect(auditSitemapInventory('<urlset><url></urlset>',NOW).findings.some(item=>item.problem==='XML_INVALID')).toBe(true);
  expect(auditSitemapInventory(editorialSitemapXml().replace('xmlns:xhtml="http://www.w3.org/1999/xhtml"',''),NOW).findings.some(item=>item.problem==='XML_NAMESPACE')).toBe(true);
 });
 it('samples large collections within a fixed budget, retains all static locales, and prioritizes each competition',()=>{
  const staticClusters=editorialSitemapClusters().map(paths=>({kind:'static' as const,paths,lastmod:null}));
  const news=Array.from({length:1000},(_,index):AuditCluster=>({kind:'news',paths:paths(locale=>`/${locale}/${locale==='en'?'news':'noticias'}/synthetic-${index}`),lastmod:'2026-10-18T12:00:00Z'}));
  const sports=competitions.flatMap(competition=>[
   {kind:'competition' as const,competitionId:competition.id,paths:paths(locale=>competitionPath(locale,competition.id)),lastmod:'2026-10-18T12:00:00Z'},
   ...Array.from({length:25},(_,index):AuditCluster=>({kind:'entity',competitionId:competition.id,paths:paths(locale=>sportsPath(locale,competition.sport,competition.id,`synthetic-${index}`)),lastmod:'2026-10-18T12:00:00Z'})),
  ]);
  const sample=selectAuditPages([...staticClusters,...news,...sports]),urls=new Set(sample.map(item=>item.cluster.paths[item.locale]));
  expect(sample.length).toBeLessThanOrEqual(380);expect(urls.size).toBe(sample.length);
  for(const cluster of staticClusters)for(const locale of interfaceLocales)expect(urls.has(cluster.paths[locale])).toBe(true);
  for(const competition of competitions)expect(urls.has(ORIGIN+competitionPath('en',competition.id))).toBe(true);
  expect(sample.filter(item=>item.cluster.kind==='entity').length).toBeLessThan(sports.length/2);
  expect(()=>selectAuditPages(staticClusters,1)).toThrow('SEO_STATIC_INVENTORY_EXCEEDS_SAMPLE_BUDGET');
 });
});
