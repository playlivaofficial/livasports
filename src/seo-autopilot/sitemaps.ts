import 'server-only';
import {load} from 'cheerio';
import type {QueryExecutor} from '@/database/client';
import {gscCredential,gscProperty} from '@/seo/gsc';
import {refreshTokenAccess,serviceAccountToken} from '@/seo/gsc-client';
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
export async function maintainSeoSitemaps(db:QueryExecutor,now:Date,fetcher:typeof fetch=fetch){
  const results=[];let token:string|undefined;
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
      const credential=gscCredential();
      if(!credential){await db.query("UPDATE seo_autopilot_sitemaps SET state='SETUP_REQUIRED',error_code='GSC_CREDENTIAL_MISSING' WHERE path=$1",[path]);results.push({path,state:'SETUP_REQUIRED'});continue;}
      await db.query('UPDATE seo_autopilot_sitemaps SET attempted_at=$2 WHERE path=$1',[path,now]);
      token??=credential.kind==='SERVICE_ACCOUNT'?await serviceAccountToken(credential,fetcher,now.getTime(),'https://www.googleapis.com/auth/webmasters'):await refreshTokenAccess(credential,fetcher);
      const response=await fetcher(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscProperty())}/sitemaps/${encodeURIComponent(url)}`,
        {method:'PUT',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15_000)});
      if(!response.ok){const code=response.status===403?'GSC_WRITE_PERMISSION_REQUIRED':`GSC_HTTP_${response.status}`;
        await db.query("UPDATE seo_autopilot_sitemaps SET state='SUBMISSION_BLOCKED',error_code=$2 WHERE path=$1",[path,code]);results.push({path,state:code});continue;}
      await db.query("UPDATE seo_autopilot_sitemaps SET submitted_hash=$2,submitted_at=$3,state='SUBMITTED',error_code=NULL WHERE path=$1",[path,hash,now]);results.push({path,state:'SUBMITTED'});
    }catch{await db.query("UPDATE seo_autopilot_sitemaps SET state='FAILED',error_code='SITEMAP_MAINTENANCE_FAILED' WHERE path=$1",[path]);results.push({path,state:'FAILED'});}
  }
  return results;
}
