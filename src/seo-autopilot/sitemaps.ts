import 'server-only';
import {load} from 'cheerio';
import type {QueryExecutor} from '@/database/client';
import {GSC_API,probeGscHealth,gscResponseStatus,type GscHealth} from '@/seo/gsc-health';
import {siteOrigin} from '@/seo/policy';
import {contentHash} from './policy';

export function sitemapFingerprint(documents:string[]){
  // Child indexes do not change when an existing batch gains URLs; hash their contents too.
  return contentHash(documents.flatMap(doc=>{
    const $=load(doc,{xml:true});return $('url').map((_,el)=>({url:$(el).find('loc').text(),lastmod:$(el).find('lastmod').text()})).get();
  }).sort((a,b)=>a.url.localeCompare(b.url)));
}
export function shouldSubmitSitemap(hash:string,previous:{submitted_hash?:unknown;attempted_at?:unknown}|undefined,now:Date){
  return hash!==previous?.submitted_hash&&(!previous?.attempted_at||now.getTime()-new Date(String(previous.attempted_at)).getTime()>=86_400_000);
}
/** Two allowlisted sitemap roots only. No Indexing API, URL submission, credential persistence or blind retry. */
export async function maintainSeoSitemaps(db:QueryExecutor,now:Date,fetcher:typeof fetch=fetch,onHealth?:(health:GscHealth)=>void){
  const results=[];
  const {health,token}=await probeGscHealth(now,fetcher);
  const read=async(url:string)=>{if(new URL(url).origin!==siteOrigin)throw Error('SITEMAP_ORIGIN_INVALID');
    const r=await fetcher(url,{signal:AbortSignal.timeout(12_000),redirect:'error'});if(!r.ok)throw Error('SITEMAP_FETCH_FAILED');return r.text();};
  for(const path of ['/sitemap.xml','/sports-sitemaps.xml']){
    const url=siteOrigin+path;
    try{
      const root=await read(url),$=load(root,{xml:true}),documents=[root];
      const children=$('sitemap > loc').map((_,e)=>$(e).text()).get();
      if(children.length>100)throw Error('SITEMAP_BUDGET_EXCEEDED');
      for(let i=0;i<children.length;i+=4)documents.push(...await Promise.all(children.slice(i,i+4).map(read)));
      const hash=sitemapFingerprint(documents);
      const previous=(await db.query('SELECT * FROM seo_autopilot_sitemaps WHERE path=$1',[path])).rows[0];
      const submit=shouldSubmitSitemap(hash,previous,now);
      await db.query(`INSERT INTO seo_autopilot_sitemaps(path,content_hash,content_changed_at,state) VALUES($1,$2,$3,'DISCOVERED')
        ON CONFLICT(path) DO UPDATE SET content_hash=$2,content_changed_at=CASE WHEN seo_autopilot_sitemaps.content_hash<>$2 THEN $3 ELSE seo_autopilot_sitemaps.content_changed_at END`,[path,hash,now]);
      if(!submit){results.push({path,state:hash===previous?.submitted_hash?'UNCHANGED':'BACKOFF'});continue;}
      if(!token){await db.query("UPDATE seo_autopilot_sitemaps SET state='SETUP_REQUIRED',error_code='GSC_AUTH_UNAVAILABLE' WHERE path=$1",[path]);results.push({path,state:'SETUP_REQUIRED'});continue;}
      await db.query('UPDATE seo_autopilot_sitemaps SET attempted_at=$2 WHERE path=$1',[path,now]);
      if(health.authScopeStatus!=='WEBMASTERS'||!['siteOwner','siteFullUser'].includes(health.propertyPermissionStatus)){
        const code=health.authScopeStatus==='READ_ONLY'?'SCOPE_INSUFFICIENT':health.authScopeStatus==='UNKNOWN'?'AUTH_ERROR':'PROPERTY_DENIED';
        health.sitemapWrite=health.lastSubmissionError=code;
        await db.query("UPDATE seo_autopilot_sitemaps SET state='SUBMISSION_BLOCKED',error_code=$2 WHERE path=$1",[path,code]);results.push({path,state:code});continue;
      }
      const response=await fetcher(`${GSC_API}/sites/${encodeURIComponent(health.configuredProperty)}/sitemaps/${encodeURIComponent(url)}`,
        {method:'PUT',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15_000)});
      if(!response.ok){const code=await gscResponseStatus(response);health.sitemapWrite=health.lastSubmissionError=code;
        await db.query("UPDATE seo_autopilot_sitemaps SET state='SUBMISSION_BLOCKED',error_code=$2 WHERE path=$1",[path,code]);results.push({path,state:code});continue;}
      await db.query("UPDATE seo_autopilot_sitemaps SET submitted_hash=$2,submitted_at=$3,state='SUBMITTED',error_code=NULL WHERE path=$1",[path,hash,now]);results.push({path,state:'SUBMITTED'});
      if(!health.lastSubmissionError)health.sitemapWrite='OK';
    }catch{health.sitemapWrite=health.lastSubmissionError='API_ERROR';await db.query("UPDATE seo_autopilot_sitemaps SET state='FAILED',error_code='SITEMAP_MAINTENANCE_FAILED' WHERE path=$1",[path]);results.push({path,state:'FAILED'});}
  }
  const persisted=(await db.query('SELECT submitted_at,error_code FROM seo_autopilot_sitemaps ORDER BY submitted_at DESC NULLS LAST')).rows;
  const successful=persisted.find(r=>r.submitted_at);
  health.lastSuccessfulSitemapSubmission=successful?new Date(String(successful.submitted_at)).toISOString():null;
  const previousError=persisted.find(r=>r.error_code)?.error_code;
  if(previousError&&!health.lastSubmissionError)health.lastSubmissionError=['AUTH_ERROR','SCOPE_INSUFFICIENT','PROPERTY_DENIED'].includes(String(previousError))?previousError as GscHealth['lastSubmissionError']:'API_ERROR';
  // An unchanged run never writes just to probe. Report the last proven write, not scope as success.
  if(health.sitemapWrite==='NOT_CHECKED'&&health.authScopeStatus==='WEBMASTERS'&&['siteOwner','siteFullUser'].includes(health.propertyPermissionStatus)&&health.lastSuccessfulSitemapSubmission&&!health.lastSubmissionError)health.sitemapWrite='OK';
  onHealth?.(health);
  return results;
}
