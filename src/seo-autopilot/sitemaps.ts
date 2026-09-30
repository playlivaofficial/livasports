import 'server-only';
import {randomUUID} from 'node:crypto';
import {load} from 'cheerio';
import type {QueryExecutor} from '@/database/client';
import {GSC_API,probeGscHealth,type GscHealth} from '@/seo/gsc-health';
import {siteOrigin} from '@/seo/policy';
import {googleDiagnostic,networkDiagnostic,nextSitemapRetry,permanentFailure,SitemapError,sitemapError,type SitemapDiagnostic,type SitemapStage} from '@/seo/sitemap-errors';
import {contentHash} from './policy';
import {readSitemapTree,type SitemapReadBudget} from './sitemap-fetch';

export function sitemapFingerprint(documents:string[]){
  return contentHash(documents.flatMap(doc=>{
    const $=load(doc,{xml:true});return $('*').filter((_,el)=>'tagName' in el&&el.tagName.split(':').pop()==='url').map((_,el)=>({url:$(el).children().filter((_,n)=>n.tagName.split(':').pop()==='loc').text(),lastmod:$(el).children().filter((_,n)=>n.tagName.split(':').pop()==='lastmod').text()})).get();
  }).sort((a,b)=>a.url.localeCompare(b.url)));
}
export function shouldSubmitSitemap(hash:string,previous:{submitted_hash?:unknown;attempted_at?:unknown}|undefined,now:Date){
  return hash!==previous?.submitted_hash&&(!previous?.attempted_at||now.getTime()-new Date(String(previous.attempted_at)).getTime()>=86_400_000);
}
type Row=Record<string,unknown>;
type Options={budgetMs?:number;sleep?:(ms:number)=>Promise<void>;log?:(record:Record<string,unknown>)=>void};
const roots=['/sitemap.xml','/sports-sitemaps.xml'] as const;
const stamp=(v:unknown)=>v?new Date(String(v)).toISOString():null;
/** Legacy success came from the same documented property; no gratuitous migration-time resubmit. */
const sameProperty=(row:Row,property:string)=>(row.submitted_property??'sc-domain:livasports.com')===property;
function inProperty(property:string,url:string){
  if(property.startsWith('sc-domain:')){const domain=property.slice(10);return new URL(url).hostname===domain||new URL(url).hostname.endsWith('.'+domain);}
  return property===siteOrigin+'/'&&url.startsWith(property);
}

/** No heartbeat. Atomic per-root lease covers all readers/writers, including overlapping workers. */
async function claim(db:QueryExecutor,path:string,now:Date,id:string){
  await db.query(`INSERT INTO seo_autopilot_sitemaps(path,content_hash,content_changed_at,state) VALUES($1,'',$2,'DISCOVERED') ON CONFLICT(path) DO NOTHING`,[path,now]);
  return (await db.query(`UPDATE seo_autopilot_sitemaps SET lease_token=$2,lease_until=$3 WHERE path=$1
    AND (lease_until IS NULL OR lease_until<=$4) RETURNING *`,[path,id,new Date(now.getTime()+180_000),now])).rows[0];
}
async function save(db:QueryExecutor,path:string,id:string,row:Row,values:Row,event:Row){
  // Column names are internal constants, never input. Lease fencing prevents a stale worker overwriting a successor.
  const fields=Object.keys(values),history=[...(Array.isArray(row.audit)?row.audit:[]).slice(-7),event];
  const args=[path,id,...Object.values(values),JSON.stringify(history)];
  const updated=await db.query(`UPDATE seo_autopilot_sitemaps SET ${fields.map((name,i)=>`${name}=$${i+3}`).join(',')},audit=$${args.length}::jsonb WHERE path=$1 AND lease_token=$2 RETURNING path`,args);
  if(!updated.rows.length)throw sitemapError('UNKNOWN_ERROR','PERSIST','LEASE_LOST');
}

/** Two sitemap roots; one bounded side effect. No provider/media calls, Indexing API or forced resubmission. */
export async function maintainSeoSitemaps(db:QueryExecutor,now:Date,fetcher:typeof fetch=fetch,onHealth?:(health:GscHealth)=>void,options:Options={}){
  const started=Date.now(),deadline=started+Math.max(1000,Math.min(65_000,options.budgetMs??65_000));
  const operationNow=()=>new Date(now.getTime()+Date.now()-started);
  const bounded:typeof fetch=async(input,init)=>{
    const remaining=deadline-Date.now();if(remaining<=0)throw new DOMException('Cycle deadline','TimeoutError');
    const signal=AbortSignal.timeout(remaining);
    return fetcher(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,signal]):signal});
  };
  const {health,token}=await probeGscHealth(now,bounded);
  const results:Array<{path:string;state:string}>=[],budget:SitemapReadBudget={retries:0,deadline,sleep:options.sleep};
  const log=options.log??(record=>console.info(JSON.stringify(record)));
  const context=contentHash({property:health.configuredProperty,scope:health.authScopeStatus,permission:health.propertyPermissionStatus,auth:!!token});
  for(const path of roots){
    const url=siteOrigin+path,id=randomUUID();let row:Row|undefined,stage:SitemapStage='PERSIST',hash:string|undefined,reason='CHECK',outcome='FAILED';
    const begin=Date.now();
    try{
      row=await claim(db,path,now,id);if(!row){results.push({path,state:'ALREADY_RUNNING'});continue;}
      // Retry-after is durable across processes/deploys. Do not even refetch a known transient failure early.
      if(row.next_retry_at&&Date.parse(String(row.next_retry_at))>now.getTime()){outcome='BACKOFF';results.push({path,state:outcome});continue;}
      stage='PROPERTY';if(!inProperty(health.configuredProperty,url))throw sitemapError('INVALID_PROPERTY',stage,'PROPERTY_HOST_MISMATCH');
      stage='FETCH';hash=sitemapFingerprint(await readSitemapTree(url,bounded,budget));
      stage='PERSIST';await db.query(`UPDATE seo_autopilot_sitemaps SET content_hash=$3,content_changed_at=CASE WHEN content_hash<>$3 THEN $4 ELSE content_changed_at END,checked_at=$4 WHERE path=$1 AND lease_token=$2`,[path,id,hash,now]);
      const prior=row.diagnostic as SitemapDiagnostic|null;
      const recoveredRead=prior&&['FETCH','VALIDATE'].includes(prior.stage)||row.error_code==='SITEMAP_MAINTENANCE_FAILED'&&(!row.attempted_at||Date.parse(String(row.attempted_at))<=Date.parse(String(row.submitted_at)));
      // If a PUT timed out, Google may have accepted it. Read back before considering another PUT.
      const uncertain=(prior?.stage==='SUBMIT'&&['NETWORK_ERROR','TRANSIENT_GOOGLE_ERROR'].includes(prior.category))||(!row.error_code&&row.attempted_hash!==row.submitted_hash);
      if(token&&row.attempted_hash&&row.attempted_at&&uncertain){
        stage='READBACK';const r=await bounded(`${GSC_API}/sites/${encodeURIComponent(health.configuredProperty)}/sitemaps`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15_000)});
        if(!r.ok)throw new SitemapError(await googleDiagnostic(r,stage));
        const body=await r.json() as {sitemap?:Array<{path:string;lastSubmitted?:string}>};
        const submitted=body.sitemap?.find(s=>s.path===url)?.lastSubmitted;
        if(submitted&&Date.parse(submitted)>=Math.floor(Date.parse(String(row.attempted_at))/1000)*1000){
          row={...row,submitted_hash:row.attempted_hash,submitted_at:submitted,submitted_property:health.configuredProperty,error_code:null,diagnostic:null};
          await save(db,path,id,row,{submitted_hash:row.submitted_hash,submitted_at:submitted,submitted_property:health.configuredProperty,error_code:null,diagnostic:null,next_retry_at:null,failure_count:0},{at:now.toISOString(),state:'RECONCILED',reason:'GOOGLE_READBACK'});
        }
      }
      if(hash===row.submitted_hash&&sameProperty(row,health.configuredProperty)){
        outcome='UNCHANGED';
        if(!row.error_code||recoveredRead)await save(db,path,id,row,{state:'SUBMITTED',error_code:null,diagnostic:null,next_retry_at:null,failure_count:0,blocked_context:null},{at:now.toISOString(),state:outcome});
        results.push({path,state:outcome});continue;
      }
      if(prior&&permanentFailure(prior.category)&&row.blocked_context===context&&row.content_hash===hash&&!recoveredRead){outcome='BLOCKED';results.push({path,state:outcome});continue;}
      const retrying=!!row.error_code&&!!prior&&!permanentFailure(prior.category);
      if(!retrying&&!shouldSubmitSitemap(hash,{...row,submitted_hash:sameProperty(row,health.configuredProperty)?row.submitted_hash:null},now)){
        outcome='BACKOFF';
        await save(db,path,id,row,{state:outcome,...(recoveredRead?{error_code:null,diagnostic:null,failure_count:0}:{}),next_retry_at:new Date(Date.parse(String(row.attempted_at))+86_400_000)},{at:now.toISOString(),state:outcome,reason:'DAILY_CHANGE_COOLDOWN'});
        results.push({path,state:outcome});continue;
      }
      stage='AUTH';if(!token)throw sitemapError(['NETWORK_ERROR','TRANSIENT_GOOGLE_ERROR','RATE_LIMIT','QUOTA_ERROR'].includes(health.sitemapWrite)?health.sitemapWrite as 'NETWORK_ERROR'|'TRANSIENT_GOOGLE_ERROR'|'RATE_LIMIT'|'QUOTA_ERROR':'AUTH_ERROR',stage,'TOKEN_UNAVAILABLE');
      if(health.authScopeStatus!=='WEBMASTERS')throw sitemapError('PERMISSION_ERROR',stage,'SCOPE_INSUFFICIENT');
      stage='PROPERTY';if(!['siteOwner','siteFullUser'].includes(health.propertyPermissionStatus))throw sitemapError(['NETWORK_ERROR','TRANSIENT_GOOGLE_ERROR','RATE_LIMIT','QUOTA_ERROR'].includes(health.sitemapWrite)?health.sitemapWrite as 'NETWORK_ERROR'|'TRANSIENT_GOOGLE_ERROR'|'RATE_LIMIT'|'QUOTA_ERROR':'PERMISSION_ERROR',stage,'PROPERTY_ACCESS_REQUIRED');
      // Fence immediately before the side effect; the entire network budget is shorter than the lease.
      stage='PERSIST';const fenced=await db.query(`UPDATE seo_autopilot_sitemaps SET attempted_at=$3,attempted_hash=$4 WHERE path=$1 AND lease_token=$2 AND lease_until>$3 RETURNING path`,[path,id,operationNow(),hash]);
      if(!fenced.rows.length)throw sitemapError('UNKNOWN_ERROR',stage,'LEASE_LOST');
      reason=!row.submitted_at?'NEW_SITEMAP':retrying?'RETRY_DUE':'CONTENT_CHANGED';stage='SUBMIT';
      const r=await bounded(`${GSC_API}/sites/${encodeURIComponent(health.configuredProperty)}/sitemaps/${encodeURIComponent(url)}`,{method:'PUT',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15_000)});
      if(!r.ok)throw new SitemapError(await googleDiagnostic(r,stage));
      stage='PERSIST';outcome='SUBMITTED';
      await save(db,path,id,row,{submitted_hash:hash,submitted_at:operationNow(),submitted_property:health.configuredProperty,state:outcome,error_code:null,diagnostic:null,next_retry_at:null,failure_count:0,blocked_context:null},
        {at:now.toISOString(),state:outcome,reason,httpStatus:r.status});
      log({event:'gsc-sitemap',property:health.configuredProperty,sitemap:url,reason,result:outcome,httpStatus:r.status,retry:'NONE',durationMs:Date.now()-begin});
      results.push({path,state:outcome});
    }catch(e){
      const d=networkDiagnostic(e,stage),failures=Number(row?.failure_count??0)+1,retry=nextSitemapRetry(d,failures,operationNow());
      outcome=d.category;
      if(row)try{await save(db,path,id,row,{state:retry?'RETRY_PENDING':'BLOCKED',error_code:d.category,diagnostic:JSON.stringify(d),failure_count:failures,next_retry_at:retry,blocked_context:context},
        {at:now.toISOString(),state:outcome,reason,diagnostic:d,retryAt:retry?.toISOString()??null});}catch{log({event:'gsc-sitemap',sitemap:url,result:'UNKNOWN_ERROR',stage:'PERSIST',detail:'FAILURE_AUDIT_WRITE_FAILED'});}
      if(stage==='SUBMIT'||stage==='AUTH'||stage==='PROPERTY')health.sitemapWrite=health.lastSubmissionError=d.category;
      else health.sitemapMaintenanceError=d.category;
      log({event:'gsc-sitemap',property:health.configuredProperty,sitemap:url,reason,result:d.category,stage:d.stage,httpStatus:d.httpStatus,detail:d.reason,retry:retry?.toISOString()??'CONFIG_OR_CONTENT_CHANGE_REQUIRED',durationMs:Date.now()-begin});
      results.push({path,state:outcome});
    }finally{
      if(row)await db.query('UPDATE seo_autopilot_sitemaps SET lease_token=NULL,lease_until=NULL WHERE path=$1 AND lease_token=$2',[path,id]).catch(()=>{log({event:'gsc-sitemap',sitemap:url,result:'UNKNOWN_ERROR',stage:'PERSIST',detail:'LEASE_RELEASE_FAILED_EXPIRES_AUTOMATICALLY'});});
      if(['UNCHANGED','BACKOFF','BLOCKED'].includes(outcome))log({event:'gsc-sitemap',property:health.configuredProperty,sitemap:url,reason,result:outcome,httpStatus:null,retry:row?.next_retry_at?stamp(row.next_retry_at):'NONE',durationMs:Date.now()-begin});
    }
  }
  try{
    const persisted=(await db.query('SELECT path,submitted_at,error_code,diagnostic FROM seo_autopilot_sitemaps ORDER BY submitted_at DESC NULLS LAST')).rows;
    const success=persisted.find(r=>r.submitted_at);health.lastSuccessfulSitemapSubmission=stamp(success?.submitted_at);
    for(const r of persisted){if(!r.error_code)continue;const d=r.diagnostic as SitemapDiagnostic|null;
      if(d&&['AUTH','PROPERTY','SUBMIT'].includes(d.stage))health.lastSubmissionError=d.category;
      else health.sitemapMaintenanceError=d?.category??'UNKNOWN_ERROR';}
    if(health.sitemapWrite==='NOT_CHECKED')health.sitemapWrite=health.lastSubmissionError??(health.lastSuccessfulSitemapSubmission?'OK':'NOT_CHECKED');
  }catch{health.sitemapMaintenanceError='UNKNOWN_ERROR';log({event:'gsc-sitemap',result:'UNKNOWN_ERROR',stage:'PERSIST',detail:'HEALTH_READ_FAILED'});}
  onHealth?.(health);return results;
}
