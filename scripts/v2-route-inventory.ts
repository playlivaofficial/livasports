import {load} from 'cheerio';
import {SaxesParser} from 'saxes';
import {editorialSitemapClusters} from '../src/v2/seo';
import {interfaceLocales,languageTags,type InterfaceLocale} from '../src/localization/interface';
import {newsPath} from '../src/editorial/copy';
import {competitionById,competitionPath,snapshotEntityPath,snapshotSeasonToken,sportsNamespace,sportsPath} from '../src/multisport/catalog';

const origin='https://livasports.com';
type Kind='static'|'news'|'competition'|'season'|'entity';
export interface AuditCluster {kind:Kind;paths:Record<InterfaceLocale,string>;lastmod:string|null;competitionId?:string;locales?:readonly InterfaceLocale[];fallback?:string}
export interface AuditFinding {path:string;problem:string}
export interface AuditPage {cluster:AuditCluster;locale:InterfaceLocale}
const paths=(path:(locale:InterfaceLocale)=>string)=>Object.fromEntries(interfaceLocales.map(locale=>[locale,origin+path(locale)])) as Record<InterfaceLocale,string>;
export const auditClusterLocales=(cluster:AuditCluster)=>cluster.locales??interfaceLocales;
export const auditClusterFallback=(cluster:AuditCluster)=>cluster.fallback??cluster.paths.en;
function dynamicCluster(value:string):AuditCluster|null{
 try{
  const url=new URL(value);if(url.origin!==origin||url.search||url.hash||url.username||url.password||value!==url.href)return null;
  const parts=url.pathname.split('/').slice(1),locale=parts[0] as InterfaceLocale;if(!interfaceLocales.includes(locale))return null;
  if(parts.length===3&&parts[1]===(locale==='en'?'news':'noticias')&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2]))return {kind:'news',paths:paths(target=>newsPath(target,parts[2])),lastmod:null};
  if(parts[1]!==sportsNamespace(locale))return null;
  const competition=competitionById(parts[3]);if(!competition||competition.sport!==parts[2])return null;
  const base={competitionId:competition.id,lastmod:null};
  if(parts.length===4)return {...base,kind:'competition',paths:paths(target=>competitionPath(target,competition.id))};
  if(parts.length===8&&parts[4]==='season'&&parts[6]==='entities'){
   const season=parts[5],entity=decodeURIComponent(parts[7]);
   if(!/^[a-z0-9-]{1,64}$/.test(season)||snapshotSeasonToken(season)!==season||encodeURIComponent(entity)!==parts[7]||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(entity))return null;
   return {...base,kind:'entity',paths:paths(target=>snapshotEntityPath(target,{sport:competition.sport,competitionId:competition.id,season},entity))};
  }
  if(parts.length!==6)return null;
  const token=decodeURIComponent(parts[5]);if(encodeURIComponent(token)!==parts[5])return null;
  if(parts[4]==='entities'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(token))return {...base,kind:'entity',paths:paths(target=>sportsPath(target,competition.sport,competition.id,encodeURIComponent(token)))};
  if(parts[4]==='season'&&/^[A-Za-z0-9-]{1,32}$/.test(token))return {...base,kind:'season',paths:paths(target=>`${competitionPath(target,competition.id)}/season/${encodeURIComponent(token)}`)};
 }catch{}
 return null;
}
function realDate(value:string,now:number){
 if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value))return false;
 const timestamp=Date.parse(value);return Number.isFinite(timestamp)&&timestamp<=now&&new Date(timestamp).toISOString().slice(0,10)===value.slice(0,10);
}

/** Checks EVERY XML entry. No DB, provider calls, or HTML crawling is performed here. */
export function auditSitemapInventory(body:string,now:number=Date.now()){
 const findings:AuditFinding[]=[],fail=(path:string,problem:string)=>findings.push({path,problem});
 const parser=new SaxesParser();parser.on('error',()=>fail('/sitemap.xml','XML_INVALID'));try{parser.write(body).close();}catch{fail('/sitemap.xml','XML_INVALID');}
 const xml=load(body,{xmlMode:true}),clusters=new Map<string,AuditCluster>(),byUrl=new Map<string,AuditCluster>();
 for(const clusterPaths of editorialSitemapClusters()){
  const cluster:AuditCluster={kind:'static',paths:clusterPaths,lastmod:null};clusters.set(cluster.paths.en,cluster);for(const url of Object.values(cluster.paths))byUrl.set(url,cluster);
 }
 if(xml('urlset').length!==1||xml('urlset').attr('xmlns')!=='http://www.sitemaps.org/schemas/sitemap/0.9'||xml('urlset').attr('xmlns:xhtml')!=='http://www.w3.org/1999/xhtml')fail('/sitemap.xml','XML_NAMESPACE');
 const nodes=xml('urlset > url').toArray(),submitted=new Set<string>(),lastmods=new Map<string,string>();
 if(xml('url').length!==nodes.length)fail('/sitemap.xml','NESTED_URL_ENTRY');
 if(nodes.length>50000)fail('/sitemap.xml','URL_LIMIT');
 for(const node of nodes){
  const loc=xml(node).find('loc').text();if(xml(node).find('loc').length!==1)fail(loc,'LOC_COUNT');
  if(submitted.has(loc))fail(loc,'DUPLICATE_CANONICAL');submitted.add(loc);
  let cluster=byUrl.get(loc);
  if(!cluster){const candidate=dynamicCluster(loc);if(candidate){cluster=clusters.get(candidate.paths.en)??candidate;clusters.set(cluster.paths.en,cluster);for(const url of Object.values(cluster.paths))byUrl.set(url,cluster);}}
  if(!cluster){fail(loc,'UNSUPPORTED_SITEMAP_ROUTE');continue;}
  const lastmodNodes=xml(node).find('lastmod'),lastmod=lastmodNodes.text();
  if(cluster.kind==='static'){if(lastmodNodes.length)fail(loc,'ARTIFICIAL_LASTMOD');}
  else{
   if(lastmodNodes.length!==1||!realDate(lastmod,now))fail(loc,cluster.kind==='news'?'INVALID_NEWS_LASTMOD':'INVALID_SOURCE_LASTMOD');
   if(lastmods.has(cluster.paths.en)&&lastmods.get(cluster.paths.en)!==lastmod)fail(loc,'INCONSISTENT_LASTMOD');
   lastmods.set(cluster.paths.en,lastmod);cluster.lastmod=lastmod;
  }
  const alternates=xml(node).find('xhtml\\:link'),fallback=alternates.filter('[hreflang="x-default"]');
  if(cluster.kind==='news'&&!cluster.locales){
   cluster.locales=interfaceLocales.filter(locale=>alternates.filter(`[hreflang="${languageTags[locale]}"]`).length>0);
   cluster.fallback=fallback.attr('href');
   if(!cluster.locales.length||(['mx','co','pe'].some(locale=>cluster!.locales!.includes(locale as InterfaceLocale))&&!['mx','co','pe'].every(locale=>cluster!.locales!.includes(locale as InterfaceLocale))))fail(loc,'NEWS_LANGUAGE_CLUSTER');
  }
  const languages=auditClusterLocales(cluster);if(alternates.length!==languages.length+1)fail(loc,'SITEMAP_ALTERNATE_COUNT');
  if(!languages.some(locale=>cluster!.paths[locale]===loc))fail(loc,'UNAVAILABLE_NEWS_TRANSLATION');
  for(const locale of interfaceLocales){const link=alternates.filter(`[hreflang="${languageTags[locale]}"]`);if(languages.includes(locale)?link.length!==1||link.attr('rel')!=='alternate'||link.attr('href')!==cluster.paths[locale]:link.length!==0)fail(loc,'SITEMAP_HREFLANG:'+locale);}
  if(fallback.length!==1||fallback.attr('rel')!=='alternate'||fallback.attr('href')!==auditClusterFallback(cluster)||!languages.some(locale=>cluster!.paths[locale]===fallback.attr('href')))fail(loc,'SITEMAP_X_DEFAULT');
 }
 const expected=new Set([...clusters.values()].flatMap(cluster=>auditClusterLocales(cluster).map(locale=>cluster.paths[locale])));
 for(const url of expected)if(!submitted.has(url))fail(url,'MISSING_CANONICAL');
 return {clusters:[...clusters.values()],expected,submitted,findings};
}

/** All static pages/locales; recent news; each competition and representative season/entity pages. */
export function selectAuditPages(clusters:readonly AuditCluster[],limit=380):AuditPage[]{
 const pages=new Map<string,AuditPage>(),add=(cluster:AuditCluster,locale:InterfaceLocale)=>{if(pages.size<limit&&auditClusterLocales(cluster).includes(locale))pages.set(cluster.paths[locale],{cluster,locale});};
 const staticClusters=clusters.filter(cluster=>cluster.kind==='static');
 if(staticClusters.length*interfaceLocales.length>limit)throw Error('SEO_STATIC_INVENTORY_EXCEEDS_SAMPLE_BUDGET');
 for(const cluster of staticClusters)for(const locale of interfaceLocales)add(cluster,locale);
 const recent=clusters.filter(cluster=>cluster.kind==='news').sort((a,b)=>(b.lastmod??'').localeCompare(a.lastmod??'')||a.paths.en.localeCompare(b.paths.en));
 for(const cluster of recent.slice(0,10))for(const locale of interfaceLocales)add(cluster,locale);
 const sports=clusters.filter(cluster=>cluster.competitionId).sort((a,b)=>(b.lastmod??'').localeCompare(a.lastmod??'')||a.paths.en.localeCompare(b.paths.en));
 const representatives:AuditCluster[]=[];
 for(const kind of ['competition','season','entity'] as const){
  const seen=new Set<string>();for(const cluster of sports)if(cluster.kind===kind&&!seen.has(cluster.competitionId!)){seen.add(cluster.competitionId!);representatives.push(cluster);add(cluster,'en');}
 }
 // Prioritize breadth before translations; XML alternates are always checked for all locales.
 for(const locale of interfaceLocales.filter(locale=>locale!=='en'))for(const cluster of representatives)add(cluster,locale);
 for(const cluster of recent.slice(10))for(const locale of interfaceLocales)add(cluster,locale);
 return [...pages.values()];
}
