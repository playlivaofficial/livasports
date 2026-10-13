/** Bounded public guide acceptance. No credentials, provider calls or database mutations. */
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {load} from 'cheerio';
import {SaxesParser} from 'saxes';
import {helpKinds,helpPath} from '../src/localization/help-routes';
import {helpReviewDate} from '../src/localization/help-content';
import {interfaceLocales,languageTags} from '../src/localization/interface';
import {absoluteUrl,helpPaths,alternateCluster} from '../src/seo/policy';

const start=process.argv.includes('--start'),preview=process.argv.includes('--preview');
const origin=start?'http://127.0.0.1:3148':process.argv.find(arg=>/^https?:\/\//.test(arg))??'https://livasports.com';
if(!/^https:\/\/livasports\.com$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('SEO_ORIGIN_NOT_ALLOWED');
if(start&&!preview)throw Error('LOCAL_BUILD_REQUIRES_PREVIEW_MODE');
const cache=new Map<string,Promise<{status:number;body:string;headers:Headers;ms:number}>>();
const findings:{path:string;problem:string}[]=[],records:object[]=[];
let requests=0,server:ChildProcess|undefined;
async function get(path:string){
 if(!path.startsWith('/')||/^\/(api|go|owner|qa)(\/|$)/.test(path))throw Error('SEO_PATH_NOT_PUBLIC');
 let result=cache.get(path);if(result)return result;
 if(++requests>40)throw Error('SEO_REQUEST_CAP');
 result=(async()=>{const at=performance.now();const r=await fetch(origin+path,{redirect:'manual',headers:{'user-agent':'Googlebot'},signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.text(),headers:r.headers,ms:Math.round(performance.now()-at)};})();
 cache.set(path,result);return result;
}
const fail=(path:string,problem:string)=>findings.push({path,problem});
const schemas=(body:string)=>{const $=load(body);return $('script[type="application/ld+json"]').toArray().flatMap(el=>{const parsed=JSON.parse($(el).text());return Array.isArray(parsed)?parsed:parsed['@graph']??[parsed];});};
try{
 if(start){
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3148'],{stdio:['ignore','ignore','pipe'],env:{...process.env,VERCEL_ENV:'preview'}});
  server.stderr?.on('data',()=>{}); // Server diagnostics must not contaminate the JSON acceptance record.
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
   if(server.exitCode!==null)throw Error('SEO_SERVER_EXITED');
   try{const r=await fetch(origin+'/en/how-to-read-decimal-odds',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break;}}catch{}
   await delay(500);
  }
  if(!ready)throw Error('SEO_SERVER_NOT_READY');
 }
 const robots=await get('/robots.txt');
 if(robots.status!==200)fail('/robots.txt','ROBOTS_HTTP');
 if(preview){if(!/^Disallow:\s*\/\s*$/m.test(robots.body))fail('/robots.txt','PREVIEW_CRAWLABLE');}
 else{
  if(!/^Allow:\s*\/\s*$/m.test(robots.body)||/^Disallow:\s*\/\s*$/m.test(robots.body))fail('/robots.txt','PRODUCTION_BLOCKED');
  for(const path of ['/api/','/go/','/owner/','/qa/'])if(!robots.body.includes(`Disallow: ${path}`))fail('/robots.txt','PRIVATE_PATH_EXPOSED:'+path);
  if(!robots.body.includes('https://livasports.com/sitemap.xml'))fail('/robots.txt','SITEMAP_UNDECLARED');
 }
 const sitemap=await get('/sitemap.xml');
 if(sitemap.status!==200)fail('/sitemap.xml','SITEMAP_HTTP');
 if(!sitemap.headers.get('content-type')?.includes('xml'))fail('/sitemap.xml','SITEMAP_CONTENT_TYPE');
 const parser=new SaxesParser();parser.on('error',()=>fail('/sitemap.xml','SITEMAP_XML_INVALID'));parser.write(sitemap.body).close();
 const xml=load(sitemap.body,{xmlMode:true}),submitted=new Set(xml('url > loc').map((_,el)=>xml(el).text()).get());
 for(const locale of interfaceLocales)for(const kind of helpKinds){
  const path=helpPath(locale,kind),canonical=absoluteUrl(path),r=await get(path),$=load(r.body);
  const pageProblems:string[]=[];const problem=(value:string)=>{pageProblems.push(value);fail(path,value);};
  if(r.status!==200)problem('GUIDE_HTTP');
  if($('html').attr('lang')!==languageTags[locale])problem('HTML_LANGUAGE');
  if($('h1').length!==1)problem('H1_COUNT');
  if(!$('title').text()||!$('meta[name=description]').attr('content'))problem('METADATA_MISSING');
  if($('link[rel=canonical]').length!==1||$('link[rel=canonical]').attr('href')!==canonical)problem('CANONICAL_MISMATCH');
  const noindex=/noindex/i.test($('meta[name=robots]').map((_,el)=>$(el).attr('content')).get().join(',')+','+r.headers.get('x-robots-tag'));
  if(noindex!==preview)problem(preview?'PREVIEW_INDEXABLE':'PRODUCTION_NOINDEX');
  if(!submitted.has(canonical))problem('GUIDE_NOT_SUBMITTED');
  const cluster=alternateCluster(helpPaths(kind));
  for(const [tag,href] of Object.entries(cluster)){
   if($(`link[hreflang="${tag}"]`).attr('href')!==absoluteUrl(String(href)))problem('HREFLANG_MISMATCH:'+tag);
   const node=xml('url').toArray().find(el=>xml(el).find('loc').text()===canonical);
   if(!node||xml(node).find(`xhtml\\:link[hreflang="${tag}"]`).attr('href')!==absoluteUrl(String(href)))problem('SITEMAP_ALTERNATE_MISMATCH:'+tag);
  }
  const reviewed=$('main time[datetime]').attr('datetime');
  if(reviewed!==helpReviewDate(locale,kind))problem('REVIEW_DATE_MISMATCH');
  try{
   const data=schemas(r.body),article=data.find(s=>s['@type']==='Article'),breadcrumb=data.find(s=>s['@type']==='BreadcrumbList');
   if(!article||article.url!==canonical||article.headline!==$('h1').text()||article.dateModified!==reviewed||article.inLanguage!==languageTags[locale])problem('ARTICLE_FACT_MISMATCH');
   if(!breadcrumb||breadcrumb.itemListElement.length<2||breadcrumb.itemListElement.at(-1)?.item!==canonical)problem('BREADCRUMB_MISMATCH');
   if(article?.offers||article?.aggregateRating)problem('UNSUPPORTED_COMMERCIAL_SCHEMA');
  }catch{problem('JSON_LD_INVALID');}
  // Root footer makes every guide discoverable from any public route without a session.
  for(const topic of helpKinds)if(!$(`footer a[href="${helpPath(locale,topic)}"]`).length)problem('FOOTER_ORPHAN:'+topic);
  if(kind!=='favorites'){
   const slug=({mx:'liga-mx',co:'colombia-primera-a',pe:'peru-liga-1',br:'brasileirao-serie-a',en:'premier-league'} as const)[locale];
   if(!$(`main a[href="/${locale}/${locale==='en'?'football':locale==='br'?'futebol':'futbol'}?competition=${slug}"]`).length)problem('DOMESTIC_LINK_MISSING');
  }
  records.push({path,status:r.status,canonical,title:$('title').text(),h1:$('h1').text(),reviewed,indexable:!noindex,ms:r.ms,problems:pageProblems});
 }
 console.log(JSON.stringify({generatedAt:new Date().toISOString(),origin,mode:preview?'preview':'production',requests,guideCount:records.length,providerRequests:0,records,findings},null,2));
 process.exitCode=findings.length?1:0;
}catch(error){console.log(JSON.stringify({origin,requests,findings,error:error instanceof Error?error.message:'SEO_CHECK_FAILED'}));process.exitCode=1;}
finally{server?.kill();}
