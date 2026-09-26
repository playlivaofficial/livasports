import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {siteOrigin} from './policy';
import {deriveSeoAlerts,type SeoAlert,type SeoProblem,type SeoSnapshot,type SubmittedFamily} from './monitoring';
import {gscStatus} from './gsc';
import {ingestGscSearchAnalytics} from './gsc-ingest';

/**
 * Daily technical SEO snapshot. Fetches our own sitemaps, counts the submitted inventory by family and
 * locale, then samples a bounded number of submitted URLs and checks each one the way a crawler would:
 * status, robots meta, canonical. Everything it touches is our own origin — no third-party API, no
 * provider budget, no credential.
 */
const decode=(value:string)=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const locsOf=(xml:string)=>[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>decode(m[1]));

/** Sampled per run. Small enough to stay well inside a serverless invocation, spread across the inventory. */
export const SEO_SAMPLE_SIZE=24;

export function familyOf(url:string):SubmittedFamily|'other'{
  let parsed:URL;try{parsed=new URL(url);}catch{return 'other';}
  const path=parsed.pathname;
  if(/^\/(br|mx|en)$/.test(path))return 'home';
  if(/\/(jogo|partido|match)\//.test(path))return 'match';
  if(/\/(time|equipo|team)\//.test(path))return 'team';
  if(/\/(futebol|futbol|football)$/.test(path))return parsed.searchParams.get('competition')?'competition':'football';
  if(/\/(ao-vivo|en-vivo|live)$/.test(path))return 'live';
  if(/\/(jogos\/hoje|partidos\/hoy|matches\/today)$/.test(path))return 'today';
  return 'content';
}
const localeOf=(url:string)=>{const m=/^\/(br|mx|en)(\/|$)/.exec(new URL(url).pathname);return m?m[1]:'other';};

type Fetcher=(url:string,init?:RequestInit)=>Promise<Response>;

/** Evenly spaced sample so every part of the inventory is represented, not just the first batch. */
export function spreadSample<T>(items:readonly T[],size:number):T[]{
  if(items.length<=size)return [...items];
  const step=items.length/size;
  return Array.from({length:size},(_,i)=>items[Math.floor(i*step)]);
}

export async function collectSeoSnapshot(fetcher:Fetcher=fetch,now=new Date(),origin=siteOrigin):Promise<SeoSnapshot>{
  const problems:SeoProblem[]=[];
  const text=async(url:string)=>{const r=await fetcher(url,{headers:{'user-agent':'LivaSportsSeoMonitor/1.0'}});
    return r.ok?r.text():'';};

  const primaryXml=await text(`${origin}/sitemap.xml`).catch(()=>'');
  const indexXml=await text(`${origin}/sports-sitemaps.xml`).catch(()=>'');
  if(!primaryXml)problems.push({type:'SITEMAP_UNREACHABLE',url:`${origin}/sitemap.xml`});
  if(!indexXml)problems.push({type:'SITEMAP_UNREACHABLE',url:`${origin}/sports-sitemaps.xml`});
  let urls=locsOf(primaryXml);
  for(const child of locsOf(indexXml)){
    const childXml=await text(child).catch(()=>'');
    if(!childXml){problems.push({type:'SITEMAP_UNREACHABLE',url:child});continue;}
    urls=urls.concat(locsOf(childXml));
  }

  const families:Partial<Record<SubmittedFamily,number>>={};
  const locales:Record<string,number>={};
  for(const url of urls){
    const family=familyOf(url);
    if(family!=='other')families[family]=(families[family]??0)+1;
    const locale=localeOf(url);locales[locale]=(locales[locale]??0)+1;
  }

  for(const url of spreadSample(urls,SEO_SAMPLE_SIZE)){
    const family=familyOf(url);
    let response:Response;
    try{response=await fetcher(url,{redirect:'manual',headers:{'user-agent':'LivaSportsSeoMonitor/1.0'}});}
    catch{problems.push({type:'ERROR_IN_SITEMAP',url,family,detail:'request failed'});continue;}
    if(response.status>=300&&response.status<400){
      problems.push({type:'REDIRECT_IN_SITEMAP',url,family,detail:`${response.status} → ${response.headers.get('location')??'?'}`});continue;}
    if(response.status>=400){problems.push({type:'ERROR_IN_SITEMAP',url,family,detail:String(response.status)});continue;}
    const body=await response.text();
    const robots=/name="robots"\s+content="([^"]+)"/.exec(body)?.[1]??null;
    const canonical=decode(/rel="canonical"\s+href="([^"]+)"/.exec(body)?.[1]??'');
    if(robots&&/noindex/i.test(robots))problems.push({type:'NOINDEX_IN_SITEMAP',url,family,detail:robots});
    else if(!canonical)problems.push({type:'CANONICAL_MISSING',url,family});
    else if(canonical!==url)problems.push({type:'CANONICAL_MISMATCH',url,family,detail:canonical});
  }

  const robotsBody=await text(`${origin}/robots.txt`).catch(()=>'');
  const robotsOk=robotsBody?/sitemap\.xml/i.test(robotsBody)&&/sports-sitemaps\.xml/i.test(robotsBody):null;

  return {capturedAt:now.toISOString(),submittedTotal:urls.length,families,locales,
    sampled:Math.min(urls.length,SEO_SAMPLE_SIZE),problems,robotsOk};
}

export interface SeoRunResult {state:'SUCCEEDED'|'FAILED';day:string;submittedTotal:number;problems:number;alerts:number;providerRequests:0;error?:string;
  gsc?:{state:string;days:number;rows:number;error?:string}}

const day=(date:Date)=>date.toISOString().slice(0,10);

/** Previous stored snapshot, used as the comparison baseline. */
export async function previousSeoSnapshot(db:QueryExecutor,before:string):Promise<SeoSnapshot|null>{
  const row=(await db.query(`SELECT captured_at,submitted_total,families,locales,sampled,problems,robots_ok
    FROM seo_snapshots WHERE source='TECHNICAL' AND captured_day<$1::date ORDER BY captured_day DESC LIMIT 1`,[before])).rows[0];
  if(!row)return null;
  return {capturedAt:new Date(row.captured_at as string).toISOString(),submittedTotal:Number(row.submitted_total),
    families:(row.families??{}) as SeoSnapshot['families'],locales:(row.locales??{}) as Record<string,number>,
    sampled:Number(row.sampled??0),problems:(row.problems??[]) as SeoProblem[],
    robotsOk:row.robots_ok===null||row.robots_ok===undefined?null:Boolean(row.robots_ok)};
}

/**
 * One idempotent daily run: collect, compare with the previous day, store the snapshot and its alerts.
 * Re-running on the same day updates that day's row in place instead of creating a second one.
 */
export async function runSeoMonitor(db:QueryExecutor,fetcher:Fetcher=fetch,now=new Date()):Promise<SeoRunResult>{
  const today=day(now);
  try{
    const started=Date.now();
    const snapshot=await collectSeoSnapshot(fetcher,now);
    const previous=await previousSeoSnapshot(db,today);
    const alerts:SeoAlert[]=deriveSeoAlerts(snapshot,previous);
    const status=gscStatus();
    const stored=(await db.query(`INSERT INTO seo_snapshots(captured_day,source,submitted_total,families,locales,sampled,problems,problem_count,robots_ok,gsc_state,duration_ms)
      VALUES($1::date,'TECHNICAL',$2,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10)
      ON CONFLICT(captured_day,source) DO UPDATE SET captured_at=now(),submitted_total=excluded.submitted_total,
        families=excluded.families,locales=excluded.locales,sampled=excluded.sampled,problems=excluded.problems,
        problem_count=excluded.problem_count,robots_ok=excluded.robots_ok,gsc_state=excluded.gsc_state,duration_ms=excluded.duration_ms
      RETURNING id`,[today,snapshot.submittedTotal,JSON.stringify(snapshot.families),JSON.stringify(snapshot.locales),
        snapshot.sampled,JSON.stringify(snapshot.problems),snapshot.problems.length,snapshot.robotsOk,status.state,Date.now()-started])).rows[0];
    const snapshotId=String(stored.id);
    for(const alert of alerts){
      await db.query(`INSERT INTO seo_alerts(snapshot_id,code,severity,url_family,reason,current_value,baseline_value)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(snapshot_id,code,url_family) DO UPDATE SET
          severity=excluded.severity,reason=excluded.reason,current_value=excluded.current_value,baseline_value=excluded.baseline_value`,
        [snapshotId,alert.code,alert.severity,alert.urlFamily??'',alert.reason.slice(0,400),alert.current.slice(0,120),alert.baseline.slice(0,120)]);
    }
    // Search Console is ingested after the technical snapshot is safely stored, and its failures are
    // contained here: one Search Console outage must not cost us the day's technical monitoring.
    let gsc:SeoRunResult['gsc'];
    try{
      const ingest=await ingestGscSearchAnalytics(db,{now});
      gsc={state:ingest.state,days:ingest.days,rows:ingest.rows,...(ingest.error?{error:ingest.error}:{})};
      await db.query('UPDATE seo_snapshots SET gsc_state=$2 WHERE id=$1',[snapshotId,ingest.state]).catch(()=>undefined);
    }catch(error){gsc={state:'API_ERROR',days:0,rows:0,error:error instanceof Error?error.message.slice(0,120):'GSC_INGEST_FAILED'};}
    return {state:'SUCCEEDED',day:today,submittedTotal:snapshot.submittedTotal,problems:snapshot.problems.length,alerts:alerts.length,providerRequests:0,gsc};
  }catch(error){
    return {state:'FAILED',day:today,submittedTotal:0,problems:0,alerts:0,providerRequests:0,
      error:error instanceof Error?error.message.slice(0,120):'SEO_MONITOR_FAILED'};
  }
}
