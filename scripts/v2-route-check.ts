/** Bounded public V2 release crawl: no credentials, DB writes, affiliate or provider calls. */
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {load} from 'cheerio';
import {SaxesParser} from 'saxes';
import {editorialSitemapClusters} from '../src/v2/seo';
import {interfaceLocales,languageTags} from '../src/localization/interface';
import {v2Path} from '../src/v2/routes';

const start=process.argv.includes('--start'),preview=process.argv.includes('--preview');
const origin=start?'http://127.0.0.1:3148':process.argv.find(arg=>/^https?:\/\//.test(arg))??'https://livasports.com';
if(!/^https:\/\/livasports\.com$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('SEO_ORIGIN_NOT_ALLOWED');
if(start&&!preview)throw Error('LOCAL_BUILD_REQUIRES_PREVIEW_MODE');
const findings:{path:string;problem:string}[]=[],records:object[]=[],seen=new Map<string,{status:number;body:string;headers:Headers}>();
const links=new Set<string>();let requests=0,server:ChildProcess|undefined;
const fail=(path:string,problem:string)=>findings.push({path,problem});
async function get(path:string){
 if(!path.startsWith('/')||path.startsWith('//')||/^\/(api|go|owner|qa)(\/|$)/.test(path))throw Error('SEO_PATH_NOT_PUBLIC');
 const old=seen.get(path);if(old)return old;if(++requests>260)throw Error('SEO_REQUEST_CAP');
 const response=await fetch(origin+path,{redirect:'manual',headers:{'user-agent':'LivaSports-V2-QA/1.0'},signal:AbortSignal.timeout(30000)});
 const result={status:response.status,body:await response.text(),headers:response.headers};seen.set(path,result);return result;
}
try{
 if(start){
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3148'],{stdio:'ignore',env:{...process.env,VERCEL_ENV:'preview'}});
  let ready=false;for(let attempt=0;attempt<40;attempt++){if(server.exitCode!==null)throw Error('SEO_SERVER_EXITED');try{const r=await fetch(origin+'/en',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break;}}catch{}await delay(500);}if(!ready)throw Error('SEO_SERVER_NOT_READY');
 }
 const robots=await get('/robots.txt');
 if(robots.status!==200)fail('/robots.txt','HTTP');
 if(preview){if(!/^Disallow:\s*\/\s*$/m.test(robots.body))fail('/robots.txt','PREVIEW_CRAWLABLE');}
 else{if(!/^Allow:\s*\/\s*$/m.test(robots.body)||/^Disallow:\s*\/\s*$/m.test(robots.body))fail('/robots.txt','PRODUCTION_BLOCKED');for(const path of ['/api/','/go/','/owner/','/qa/'])if(!robots.body.includes(`Disallow: ${path}`))fail('/robots.txt','PRIVATE_PATH_EXPOSED:'+path);if(!robots.body.includes('https://livasports.com/sitemap.xml'))fail('/robots.txt','SITEMAP_UNDECLARED');}
 const sitemap=await get('/sitemap.xml');if(sitemap.status!==200||!sitemap.headers.get('content-type')?.includes('xml'))fail('/sitemap.xml','HTTP_OR_TYPE');
 const parser=new SaxesParser();parser.on('error',()=>fail('/sitemap.xml','XML_INVALID'));parser.write(sitemap.body).close();
 const xml=load(sitemap.body,{xmlMode:true}),submitted=new Set(xml('url > loc').map((_,el)=>xml(el).text()).get());
 const clusters=editorialSitemapClusters(),expected=new Set(clusters.flatMap(cluster=>Object.values(cluster)));
 if(submitted.size!==expected.size||[...submitted].some(url=>!expected.has(url)))fail('/sitemap.xml','INVENTORY_MISMATCH');
 if(xml('lastmod').length)fail('/sitemap.xml','ARTIFICIAL_LASTMOD');
 for(const cluster of clusters)for(const locale of interfaceLocales){
  const canonical=cluster[locale],path=new URL(canonical).pathname,result=await get(path),$=load(result.body),problems:string[]=[];
  const issue=(problem:string)=>{problems.push(problem);fail(path,problem);};
  if(result.status!==200)issue('HTTP');if($('h1').length!==1)issue('H1_COUNT');if($('html').attr('lang')!==languageTags[locale])issue('LANGUAGE');
  if(!$('title').text()||!$('meta[name=description]').attr('content'))issue('METADATA_MISSING');
  if($('link[rel=canonical]').length!==1||$('link[rel=canonical]').attr('href')!==canonical)issue('CANONICAL');
  const noindex=/noindex/i.test($('meta[name=robots]').map((_,el)=>$(el).attr('content')).get().join(',')+','+result.headers.get('x-robots-tag'));
  if(noindex!==preview)issue(preview?'PREVIEW_INDEXABLE':'PRODUCTION_NOINDEX');
  for(const target of interfaceLocales)if($(`link[hreflang="${languageTags[target]}"]`).attr('href')!==cluster[target])issue('HREFLANG:'+target);
  if($('link[hreflang="x-default"]').attr('href')!==cluster.en)issue('X_DEFAULT');
  const node=xml('url').toArray().find(el=>xml(el).find('loc').text()===canonical);
  for(const target of interfaceLocales)if(!node||xml(node).find(`xhtml\\:link[hreflang="${languageTags[target]}"]`).attr('href')!==cluster[target])issue('SITEMAP_HREFLANG:'+target);
  $('a[href]').each((_,el)=>{const href=$(el).attr('href')!;if(href.startsWith('/')&&!href.startsWith('//'))links.add(href.split(/[?#]/)[0]);if(/^\/go(?:\/|$)/.test(href))issue('ACTIVE_AFFILIATE_LINK');});
  $('script[type="application/ld+json"]').each((_,el)=>{try{const value=JSON.parse($(el).text());if(/"(aggregateRating|offers)"/.test(JSON.stringify(value)))issue('UNVERIFIED_COMMERCIAL_SCHEMA');}catch{issue('INVALID_JSON_LD');}});
  records.push({path,status:result.status,problems});
 }
 // Every indexable page must be discoverable from ordinary server-rendered anchors.
 for(const canonical of expected){const path=new URL(canonical).pathname;if(!links.has(path))fail(path,'ORPHAN_IN_CRAWLED_HTML');}
 for(const locale of interfaceLocales){
  for(const path of [v2Path(locale,'search'),v2Path(locale,'bookmakers','betsson')]){const r=await get(path),$=load(r.body);if(r.status!==200||!/noindex/i.test($('meta[name=robots]').attr('content')??''))fail(path,'PENDING_OR_SEARCH_INDEXABLE');}
  const obsolete=`/${locale}/${locale==='en'?'live':locale==='br'?'ao-vivo':'en-vivo'}`,gone=await get(obsolete);if(gone.status!==410)fail(obsolete,'RETIRED_LIVE_NOT_410');
  const invalid=`/${locale}/this-v2-route-does-not-exist`,missing=await get(invalid);if(missing.status!==404)fail(invalid,'UNKNOWN_NOT_404');
 }
 for(const [path,destination] of [['/sports-sitemaps.xml','/sitemap.xml'],['/mx/futbol?competition=liga-mx','/mx/ligas/liga-mx']]){const r=await get(path);if(r.status!==301||!r.headers.get('location')?.endsWith(destination))fail(path,'MIGRATION_REDIRECT');}
 const gone=await get('/sports-sitemaps/matches-0.xml');if(gone.status!==410)fail('/sports-sitemaps/matches-0.xml','RETIRED_BATCH_NOT_410');
 console.log(JSON.stringify({origin,mode:preview?'preview':'production',requests,indexablePages:expected.size,providerRequestsByCrawler:0,records,findings},null,2));process.exitCode=findings.length?1:0;
}catch(error){console.log(JSON.stringify({origin,requests,findings,error:error instanceof Error?error.message:'SEO_CHECK_FAILED'}));process.exitCode=1;}
finally{server?.kill();}
