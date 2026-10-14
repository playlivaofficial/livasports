/** Bounded public acceptance of actual committed Top 5 manifests. No credentials or mutation endpoints. */
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {SaxesParser} from 'saxes';
type Pick={geo:string;fixtureId:string;rank:number;score:number;label:string;canonicalUrl:string;kickoff:string;paths:string[]};
const args=process.argv.slice(2),baseline=args.includes('--baseline'),file=args.find(arg=>!arg.startsWith('--'));
if(!file)throw Error('TOP5_MANIFEST_REQUIRED');
const manifest=JSON.parse(await readFile(file,'utf8'));
const selected:Pick[]=manifest.geos?manifest.geos.flatMap((g:{geo:string;report?:{active:Pick[];runs:Array<{selection:Pick[]}>}})=>g.report?.active.map(r=>({...r,geo:g.geo,paths:(g.report?.runs.flatMap(run=>run.selection).find(p=>p.fixtureId===r.fixtureId) as Pick&{discoveryPaths?:string[]})?.discoveryPaths??[]}))??[]):
 manifest.selections.map((r:Record<string,unknown>)=>({geo:String(r.geo),fixtureId:String(r.id),rank:Number(r.priority_rank),score:Number(r.priority_score),label:`${r.home} × ${r.away}`,canonicalUrl:String(r.canonical_url),kickoff:String(r.kickoff),paths:[]}));
const origin='https://livasports.com',findings:Array<{path:string;problem:string}>=[],records:object[]=[],sources:object[]=[],cache=new Map<string,Promise<{status:number;body:string;headers:Headers}>>();let requests=0;
const fail=(path:string,problem:string)=>findings.push({path,problem});
async function get(path:string){
 if(!path.startsWith('/')||/^\/(api|go|owner|qa|_next)(\/|$)/.test(path))throw Error('TOP5_PUBLIC_PATH_ONLY');
 let value=cache.get(path);if(value)return value;if(++requests>100)throw Error('TOP5_REQUEST_CAP');
 value=(async()=>{try{const r=await fetch(origin+path,{redirect:'manual',headers:{'user-agent':'Googlebot'},signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.text(),headers:r.headers};}catch{return {status:0,body:'',headers:new Headers()};}})();cache.set(path,value);return value;
}
const submitted=new Set<string>();
try{
 for(const geo of ['MX','CO','PE']){const rows=selected.filter(p=>p.geo===geo);if(rows.length!==5||new Set(rows.map(r=>r.fixtureId)).size!==5)fail(geo,'NOT_FIVE_UNIQUE_FIXTURES');}
 const index=await get('/sports-sitemaps.xml'),$index=load(index.body,{xmlMode:true});
 if(index.status!==200)fail('/sports-sitemaps.xml','INDEX_HTTP');
 const children=$index('sitemap > loc').map((_,el)=>$index(el).text()).get().filter(url=>url.includes('/matches-'));
 for(const url of children){const u=new URL(url);if(u.origin!==origin)throw Error('TOP5_FOREIGN_SITEMAP');const xml=await get(u.pathname),parser=new SaxesParser();parser.on('error',()=>fail(u.pathname,'INVALID_XML'));parser.write(xml.body).close();const $=load(xml.body,{xmlMode:true});$('url > loc').each((_,el)=>{submitted.add($(el).text());});}
 const robots=await get('/robots.txt');if(robots.status!==200||!/^Allow:\s*\/\s*$/m.test(robots.body)||/^Disallow:\s*\/\s*$/m.test(robots.body))fail('/robots.txt','PRODUCTION_CRAWL_BLOCKED');
 for(const pick of selected){
  const url=new URL(pick.canonicalUrl),locale=pick.geo.toLowerCase();if(url.origin!==origin||!url.pathname.startsWith(`/${locale}/partido/`))throw Error('TOP5_CANONICAL_IDENTITY');
  const path=url.pathname,r=await get(path),$=load(r.body),problems:string[]=[];const problem=(p:string)=>{problems.push(p);fail(path,p);};
  if(Date.parse(pick.kickoff)<=Date.now())problem('NOT_UPCOMING');if(r.status!==200)problem('HTTP_STATUS');
  if($('h1').length!==1)problem('H1_COUNT');if(!$('title').text()||!$('meta[name="description"]').attr('content'))problem('METADATA_MISSING');
  if($('link[rel="canonical"]').length!==1||$('link[rel="canonical"]').attr('href')!==pick.canonicalUrl)problem('CANONICAL_MISMATCH');
  if($('html').attr('lang')!==`es-${pick.geo}`)problem('LANGUAGE');
  if(/noindex/i.test($('meta[name="robots"]').map((_,el)=>$(el).attr('content')).get().join(',')+','+r.headers.get('x-robots-tag')))problem('NOINDEX');
  for(const tag of ['es-MX','es-CO','es-PE','x-default'])if(!$(`link[hreflang="${tag}"]`).length)problem('ALTERNATE_MISSING:'+tag);
  if(!submitted.has(pick.canonicalUrl))problem('NOT_IN_MATCH_SITEMAP');
  let data:Array<Record<string,unknown>>=[];
  try{data=$('script[type="application/ld+json"]').toArray().flatMap(el=>{const p=JSON.parse($(el).text());return Array.isArray(p)?p:p['@graph']??[p];});}catch{problem('INVALID_JSON_LD');}
  if(!data.some(s=>s['@type']==='BreadcrumbList'))problem('BREADCRUMB_MISSING');
  const event=data.find(s=>s['@type']==='SportsEvent');
  if(event&&(event.url!==pick.canonicalUrl||Date.parse(String(event.startDate))!==Date.parse(pick.kickoff)||event.eventStatus!=='https://schema.org/EventScheduled'||!event.location))problem('EVENT_FACT_MISMATCH');
  const paths=[...new Set([`/${locale}`,`/${locale}/partidos/hoy`,...pick.paths])];
  for(const source of paths){const response=await get(source),html=load(response.body),linked=html(`nav[data-growth-promotion="daily-top5"][data-growth-geo="${pick.geo}"] a[href="${path}"]`).length>0;
   const plainAnchor=html(`a[href="${path}"]`).length>0,legacyFeaturedAnchor=html(`nav.seo-priority-links a[href="${path}"]`).length>0;
   if(response.status!==200||!linked)problem('DAILY_TOP5_PLACEMENT_MISSING:'+source);
   sources.push({geo:pick.geo,fixtureId:pick.fixtureId,path:source,status:response.status,linked,plainAnchor,legacyFeaturedAnchor,htmlAnchor:true});
  }
  records.push({geo:pick.geo,rank:pick.rank,fixtureId:pick.fixtureId,label:pick.label,score:pick.score,url:pick.canonicalUrl,kickoff:pick.kickoff,status:r.status,title:$('title').text(),h1:$('h1').text(),description:$('meta[name="description"]').attr('content'),schemas:data.map(s=>s['@type']),event:event?'VALID':'OMITTED_WITHOUT_SUPPORTED_LOCATION',inSitemap:submitted.has(pick.canonicalUrl),indexable:!problems.includes('NOINDEX'),inboundPaths:paths,problems,googleIndexState:'NOT_INSPECTED_BY_HTTP_AUDIT'});
 }
 for(const geo of ['MX','CO','PE']){const rows=records.filter(r=>(r as {geo:string}).geo===geo) as Array<{title:string}>;if(new Set(rows.map(r=>r.title)).size!==rows.length)fail(geo,'DUPLICATE_TOP5_TITLE_WITHIN_GEO');}
 console.log(JSON.stringify({generatedAt:new Date().toISOString(),origin,mode:baseline?'pre-release-baseline':'production-acceptance',requests,selectedCount:selected.length,records,sources,findings,providerRequests:0},null,2));
 process.exitCode=!baseline&&findings.length?1:0;
}catch(error){console.log(JSON.stringify({origin,requests,findings,error:error instanceof Error?error.message:'TOP5_AUDIT_FAILED',providerRequests:0}));process.exitCode=1;}
