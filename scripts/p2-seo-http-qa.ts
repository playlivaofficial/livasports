/**
 * P2 SEO HTTP QA — bounded, policy-driven validation of a built app or production.
 *
 *   node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/p2-seo-http-qa.ts http://localhost:3300
 *   node --require ./scripts/tsx-windows-preload.cjs --import tsx scripts/p2-seo-http-qa.ts https://livasports.com --budget=240
 *
 * Fetches robots + sitemaps once, validates every sitemap URL structurally without requesting it, then
 * requests a representative sample (all competition entry pages × 3 locales, sampled tabs/seasons/pages,
 * entities, invalid cases, private surfaces, help pages) with concurrency 3, timeouts, one retry with
 * backoff and a hard request budget. It never follows /go redirects or affiliate destinations and only
 * compares canonical/hreflang/robots/JSON-LD against src/seo/policy.ts.
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {FOOTBALL_COMPETITION_TARGETS} from '../src/config/footballCompetitions';
import {validateSitemapUrls} from '../src/sports/sitemap';
import {competitionPath} from '../src/sports/policy';
import {helpKinds,helpPath} from '../src/localization/help-routes';
import {legalKinds,legalPath} from '../src/localization/legal-routes';
import {interfaceRoutes} from '../src/localization/interface';
import {authRoutes} from '../src/localization/auth-copy';
import {favoritesRoutes} from '../src/localization/favorites-copy';
import {robotsDisallow} from '../src/seo/policy';

const args=process.argv.slice(2);
const base=new URL(args.find(a=>!a.startsWith('--'))??'http://localhost:3300');
const budget=Number(args.find(a=>a.startsWith('--budget='))?.slice(9)??240);
const production=base.hostname==='livasports.com';
// Preview deployments are globally noindex + Disallow: / by design; index expectations are skipped there.
const preview=args.includes('--preview');
const origin='https://livasports.com';
const locales=['br','mx','en'] as const;
type Locale=typeof locales[number];
const userAgents={html:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LivaSportsSeoQA/1.0',bot:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) LivaSportsSeoQA/1.0',social:'facebookexternalhit/1.1 LivaSportsSeoQA/1.0'};

interface Check {id:string;path:string;agent?:keyof typeof userAgents;expect:Expectation;}
interface Expectation {status?:number|number[];canonical?:string|null;index?:boolean;alternates?:number;jsonLd?:string[];h1?:boolean;location?:string;xml?:boolean;noUserData?:boolean;}
interface Result {id:string;path:string;status:number;ms:number;ok:boolean;reasons:string[];canonical?:string|null;robots?:string|null;alternates?:number;providerRequests?:number;}

let requests=0;const results:Result[]=[];
async function fetchOnce(url:URL,agent:keyof typeof userAgents){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{return await fetch(url,{redirect:'manual',signal:controller.signal,headers:{'user-agent':userAgents[agent],accept:'text/html,application/xml;q=0.9,*/*;q=0.8'}});}
  finally{clearTimeout(timer);}
}
async function get(path:string,agent:keyof typeof userAgents='html'){
  if(requests>=budget)throw Error('BUDGET_EXHAUSTED');
  const url=new URL(path,base);requests++;const started=performance.now();
  try{const response=await fetchOnce(url,agent);return {response,body:await response.text(),ms:Math.round(performance.now()-started)};}
  catch(error){
    if(requests>=budget)throw error;
    await new Promise(r=>setTimeout(r,1500));requests++;
    const response=await fetchOnce(url,agent);return {response,body:await response.text(),ms:Math.round(performance.now()-started)};
  }
}
// React serialises hrefLang in camel case and & as &amp; inside attributes; HTML is case-insensitive and entity-decoded.
const attr=(tag:string,name:string)=>new RegExp(`${name}=["']([^"']*)["']`,'i').exec(tag)?.[1]?.replace(/&amp;/g,'&')??null;
function head(body:string){
  const tags=body.match(/<(?:link|meta)\b[^>]*>/g)??[];
  const canonical=tags.filter(t=>/rel=["']canonical["']/.test(t)).map(t=>attr(t,'href'));
  const alternates=tags.filter(t=>/rel=["']alternate["']/.test(t)&&/hreflang=/i.test(t)).map(t=>({lang:attr(t,'hreflang'),href:attr(t,'href')}));
  const robots=tags.filter(t=>/name=["']robots["']/.test(t)).map(t=>attr(t,'content'));
  const og=tags.filter(t=>/property=["']og:/.test(t)).map(t=>[attr(t,'property'),attr(t,'content')] as const);
  const jsonLd=[...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>{try{return JSON.parse(m[1]);}catch{return {'@type':'INVALID_JSON'};}});
  const types=jsonLd.flatMap(block=>Array.isArray(block)?block:[block]).map(block=>String(block['@type']));
  return {canonical,alternates,robots,og,types,h1:/<h1[\s>]/.test(body),title:/<title>([^<]*)<\/title>/.exec(body)?.[1]??null};
}
function evaluate(check:Check,status:number,body:string,headers:Headers):string[]{
  const reasons:string[]=[],e=check.expect;
  const wanted=e.status===undefined?[200]:Array.isArray(e.status)?e.status:[e.status];
  if(!wanted.includes(status))reasons.push(`HTTP_${status}`);
  if(e.location!==undefined&&(headers.get('location')??'')!==e.location&&!(headers.get('location')??'').endsWith(e.location))reasons.push(`LOCATION_${headers.get('location')}`);
  if(e.xml){if(!/^<\?xml/.test(body.trim()))reasons.push('NOT_XML');return reasons;}
  if(status!==200)return reasons;
  const h=head(body);
  if(/Unable to load this page|Application error|__next_error__/.test(body))reasons.push('ERROR_BOUNDARY');
  if(e.canonical!==undefined){
    if(e.canonical===null){if(h.canonical.length)reasons.push(`UNEXPECTED_CANONICAL_${h.canonical[0]}`);}
    else if(h.canonical.length!==1)reasons.push(`CANONICAL_COUNT_${h.canonical.length}`);
    else if(h.canonical[0]!==origin+e.canonical)reasons.push(`CANONICAL_${h.canonical[0]}`);
  }
  if(h.canonical.some(c=>c&&!c.startsWith(origin)))reasons.push('CANONICAL_HOST');
  if(e.index!==undefined&&!preview){const noindex=h.robots.some(r=>/noindex/.test(r??''));if(e.index===noindex)reasons.push(noindex?'UNEXPECTED_NOINDEX':'MISSING_NOINDEX');}
  if(e.alternates!==undefined){
    if(h.alternates.length!==e.alternates)reasons.push(`ALTERNATES_${h.alternates.length}`);
    if(e.alternates>0){
      const langs=h.alternates.map(a=>a.lang);for(const lang of ['pt-BR','es-MX','en','x-default'])if(!langs.includes(lang))reasons.push(`HREFLANG_MISSING_${lang}`);
      if(h.alternates.some(a=>!a.href?.startsWith(origin)))reasons.push('ALTERNATE_HOST');
      if(!h.alternates.some(a=>a.href===h.canonical[0]))reasons.push('ALTERNATES_NOT_SELF_INCLUSIVE');
      if(h.alternates.some(a=>a.lang==='br'||a.lang==='mx'))reasons.push('HREFLANG_REGION_CODE');
    }
  }
  if(e.jsonLd)for(const type of e.jsonLd)if(!h.types.includes(type))reasons.push(`JSONLD_MISSING_${type}`);
  if(h.types.includes('INVALID_JSON'))reasons.push('JSONLD_INVALID');
  if(e.h1&&!h.h1)reasons.push('MISSING_H1');
  if(e.noUserData&&/@[a-z0-9-]+\.(com|net|org|br|mx)|magic-link|callbackUrl=|token=/i.test(head(body).og.map(o=>o[1]).join(' ')+(h.title??'')+h.canonical.join(' ')))reasons.push('USER_DATA_IN_METADATA');
  if(e.index!==false&&status===200&&!h.og.some(o=>o[0]==='og:image'))reasons.push('MISSING_OG_IMAGE');
  if(status===200&&!preview&&h.robots.some(r=>/noindex/.test(r??''))&&e.index===undefined&&check.id==='competition')reasons.push('UNEXPECTED_NOINDEX');
  return reasons;
}

async function run(check:Check){
  try{
    const {response,body,ms}=await get(check.path,check.agent);
    const reasons=evaluate(check,response.status,body,response.headers);
    const h=response.status===200&&!check.expect.xml?head(body):null;
    results.push({id:check.id,path:check.path,status:response.status,ms,ok:!reasons.length,reasons,canonical:h?.canonical[0],robots:h?.robots[0],alternates:h?.alternates.length});
    return body;
  }catch(error){results.push({id:check.id,path:check.path,status:0,ms:0,ok:false,reasons:[String((error as Error).message)]});return '';}
}
async function pool(checks:Check[],concurrency=3){let cursor=0;const bodies:string[]=[];await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<checks.length){const i=cursor++;bodies[i]=await run(checks[i]);}}));return bodies;}

// ---------------------------------------------------------------------------
const enabled=FOOTBALL_COMPETITION_TARGETS.filter(t=>t.enabled);
const summary:Record<string,unknown>={base:base.origin,production,budget,startedAt:new Date().toISOString()};

// 1. robots + sitemap documents (fetched once, validated structurally; no per-URL requests)
const robots=await get('/robots.txt');
summary.robots={status:robots.response.status,allowsRoot:/Allow: \/\s/.test(robots.body),disallows:robotsDisallow.filter(rule=>robots.body.includes(`Disallow: ${rule}`)).length,blocksQueries:/Disallow: \/\*\?|Disallow: \*\?/.test(robots.body),sitemaps:(robots.body.match(/^Sitemap: .*/gm)??[]).length,globalDisallow:/Disallow: \/\s*$/m.test(robots.body)};
const primary=await get('/sitemap.xml');
const primaryUrls=[...primary.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const primaryProblems=validateSitemapUrls(primaryUrls);
const index=await get('/sports-sitemaps.xml');
const batches=[...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const sampleBatches=[batches[0],batches.find(b=>/teams-0/.test(b)),batches.find(b=>/players-0/.test(b)),batches[batches.length-1]].filter((b):b is string=>!!b);
const batchStats:Array<{batch:string;status:number;ms:number;urls:number;problems:number;bytes:number}>=[];
for(const batch of sampleBatches){const r=await get(new URL(batch).pathname);const urls=[...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);batchStats.push({batch:new URL(batch).pathname,status:r.response.status,ms:r.ms,urls:urls.length,problems:validateSitemapUrls(urls).length,bytes:Buffer.byteLength(r.body)});}
summary.sitemaps={primary:{status:primary.response.status,ms:primary.ms,urls:primaryUrls.length,problems:primaryProblems.slice(0,10),competitionUrls:primaryUrls.filter(u=>u.includes('?competition=')).length,entityUrls:primaryUrls.filter(u=>/\/(match|jogo|partido|team|time|equipo|player|jogador|jugador)\//.test(u)).length,withLastmod:(primary.body.match(/<lastmod>/g)??[]).length},
  index:{status:index.response.status,ms:index.ms,files:batches.length,byKind:{matches:batches.filter(b=>/matches-/.test(b)).length,teams:batches.filter(b=>/teams-/.test(b)).length,players:batches.filter(b=>/players-/.test(b)).length}},batches:batchStats};

// 2. representative page checks
const checks:Check[]=[];
for(const locale of locales){
  checks.push({id:'home',path:interfaceRoutes[locale].home,expect:{canonical:interfaceRoutes[locale].home,index:true,alternates:4,jsonLd:['Organization','WebSite'],h1:true,noUserData:true}});
  checks.push({id:'football',path:interfaceRoutes[locale].football,expect:{canonical:interfaceRoutes[locale].football,index:true,alternates:4,h1:true}});
  checks.push({id:'football-filters',path:`${interfaceRoutes[locale].football}?view=results&utm_source=qa`,expect:{canonical:interfaceRoutes[locale].football,index:true}});
  checks.push({id:'search',path:`${interfaceRoutes[locale].football}?q=fla`,expect:{index:false}});
  checks.push({id:'unknown-competition',path:`${interfaceRoutes[locale].football}?competition=not-a-real-league`,expect:{status:404}});
  checks.push({id:'signin',path:authRoutes[locale].signin,expect:{status:[200,307,303],index:false}});
  // Signed-out account renders a client redirect to sign-in (200 + noindex,nofollow) because the shell is streamed before redirect().
  checks.push({id:'account',path:authRoutes[locale].account,expect:{status:[200,302,303,307],index:false,noUserData:true}});
  checks.push({id:'my-matches',path:favoritesRoutes[locale].myMatches,expect:{index:false,noUserData:true}});
  for(const kind of helpKinds)checks.push({id:`help-${kind}`,path:helpPath(locale,kind),expect:{canonical:helpPath(locale,kind),index:true,alternates:4,jsonLd:['BreadcrumbList'],h1:true}});
  checks.push({id:'legal',path:legalPath(locale,legalKinds[0]),expect:{canonical:legalPath(locale,legalKinds[0]),index:true,alternates:4}});
  for(const c of enabled)checks.push({id:'competition',path:competitionPath(locale,c.slug),expect:{canonical:competitionPath(locale,c.slug),alternates:4,jsonLd:['BreadcrumbList'],h1:true}});
}
checks.push({id:'root-redirect',path:'/',expect:{status:307}});
checks.push({id:'owner',path:'/owner/preview',expect:{status:[200,401,403,404],index:false}});
checks.push({id:'go-not-followed',path:'/go/betano',expect:{status:[302,303,307,308,404,410,403]}});
const bodies=await pool(checks);

// 3. discovered follow-ups: tabs, seasons, pagination, entities, invalid entities, bot/social parity (sampled within budget)
const discovered:Check[]=[];
const hubBodies=checks.map((c,i)=>({c,body:bodies[i]})).filter(x=>x.c.id==='competition'&&x.body);
const sampleHubs=hubBodies.filter((_,i)=>i%Math.max(1,Math.floor(hubBodies.length/9))===0).slice(0,9);
const entitySeen=new Set<string>();
for(const {c,body} of sampleHubs){
  const locale=c.path.split('/')[1] as Locale,slug=new URL(c.path,origin).searchParams.get('competition')!;
  for(const tab of ['results','standings'] as const)discovered.push({id:`tab-${tab}`,path:competitionPath(locale,slug,{tab}),expect:{alternates:4,jsonLd:['BreadcrumbList']}});
  const season=[...body.matchAll(/<option[^>]+value=["']([a-f0-9-]{36})["']/gi)].map(m=>m[1]);
  if(season[1])discovered.push({id:'historical-season',path:competitionPath(locale,slug,{season:season[1]}),expect:{canonical:competitionPath(locale,slug,{season:season[1]}),alternates:4}});
  if(season[0])discovered.push({id:'explicit-default-season',path:competitionPath(locale,slug,{season:season[0]}),expect:{}});
  discovered.push({id:'page-out-of-range',path:competitionPath(locale,slug,{tab:'results',page:999}),expect:{index:false}});
  discovered.push({id:'tracking-params',path:competitionPath(locale,slug)+'&utm_source=qa&fbclid=x',expect:{canonical:competitionPath(locale,slug)}});
  const entity=/href="(\/(?:br|mx|en)\/(?:jogo|partido|match)\/[a-z0-9-]+-[a-f0-9]{16})"/i.exec(body)?.[1];
  const team=/href="(\/(?:br|mx|en)\/(?:time|equipo|team)\/[a-z0-9-]+-[a-f0-9]{16})"/i.exec(body)?.[1];
  if(entity&&!entitySeen.has(entity)){entitySeen.add(entity);discovered.push({id:'match',path:entity,expect:{canonical:entity,alternates:4,jsonLd:['SportsEvent','BreadcrumbList'],h1:true,noUserData:true}});discovered.push({id:'match-bot',path:entity,agent:'bot',expect:{canonical:entity,alternates:4}});discovered.push({id:'match-social',path:entity,agent:'social',expect:{canonical:entity}});
    discovered.push({id:'match-stale-slug',path:entity.replace(/\/[a-z0-9-]+-([a-f0-9]{16})$/i,'/old-slug-$1'),expect:{status:308,location:entity}});}
  if(team&&!entitySeen.has(team)){entitySeen.add(team);discovered.push({id:'team',path:team,expect:{canonical:team,alternates:4,jsonLd:['SportsTeam','BreadcrumbList'],h1:true}});discovered.push({id:'team-panel-params',path:team+'?matches=results&p=2',expect:{canonical:team}});}
}
for(const locale of locales){
  const segments={br:['jogo','time','jogador'],mx:['partido','equipo','jugador'],en:['match','team','player']}[locale];
  discovered.push({id:'invalid-match',path:`/${locale}/${segments[0]}/nothing-here-0000000000000000`,expect:{status:404}});
  discovered.push({id:'invalid-team',path:`/${locale}/${segments[1]}/nothing-here-ffffffffffffffff`,expect:{status:404}});
  discovered.push({id:'invalid-player',path:`/${locale}/${segments[2]}/malformed`,expect:{status:404}});
}
// a player page reached through the first team page
const teamBody=await (async()=>{const t=discovered.find(d=>d.id==='team');return t?run(t):'';})();
const player=/href="(\/(?:br|mx|en)\/(?:jogador|jugador|player)\/[a-z0-9-]+-[a-f0-9]{16})"/i.exec(teamBody)?.[1];
if(player)discovered.push({id:'player',path:player,expect:{canonical:player,alternates:4,jsonLd:['Person','BreadcrumbList'],h1:true}});
const remaining=discovered.filter(d=>d.id!=='team').slice(0,Math.max(0,budget-requests-2));
await pool(remaining);

// 4. provider-call attribution: request-scoped counters exposed by the health endpoint are not per-request; record the QA window instead.
const health=production||base.hostname==='localhost'?await get('/api/internal/health').catch(()=>null):null;
summary.health=health?{status:health.response.status,body:(()=>{try{const j=JSON.parse(health.body);return {release:j.release?.commit,lastScoreSync:j.lastScoreSync,lastFootballSync:j.lastFootballSync};}catch{return null;}})()}:null;

const failures=results.filter(r=>!r.ok);
const byId=Object.fromEntries([...new Set(results.map(r=>r.id))].map(id=>[id,{total:results.filter(r=>r.id===id).length,failed:results.filter(r=>r.id===id&&!r.ok).length}]));
const timing=(id:string)=>{const rows=results.filter(r=>r.id===id&&r.status>0).map(r=>r.ms).sort((a,b)=>a-b);return rows.length?{n:rows.length,min:rows[0],p50:rows[Math.floor(rows.length/2)],max:rows[rows.length-1]}:null;};
Object.assign(summary,{requests,checks:results.length,failed:failures.length,byId,timing:{home:timing('home'),football:timing('football'),competition:timing('competition'),match:timing('match'),team:timing('team'),player:timing('player'),help:timing('help-comparison')},finishedAt:new Date().toISOString()});
await mkdir('output',{recursive:true});
const stamp=production?'production':preview?'preview':'local';
await writeFile(`output/p2-seo-qa-${stamp}.json`,JSON.stringify({summary,failures,results},null,2));
const robotsOk=preview?/^Disallow: \/\s*$/m.test(robots.body):(robots.response.status===200&&!(summary.robots as {globalDisallow:boolean}).globalDisallow);
console.log(JSON.stringify({status:failures.length||primaryProblems.length||!robotsOk?'FAIL':'PASS',...summary,failures:failures.slice(0,40)},null,1));
if(failures.length||primaryProblems.length||!robotsOk)process.exitCode=1;
