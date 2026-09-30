import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscCredential,gscProperty,GSC_SCOPE} from './gsc';
import {refreshTokenGrant,serviceAccountToken,GscApiError} from './gsc-client';
import {googleDiagnostic,type SitemapErrorCategory} from './sitemap-errors';

export const GSC_WRITE_SCOPE='https://www.googleapis.com/auth/webmasters';
export const GSC_API='https://searchconsole.googleapis.com/webmasters/v3';
export type GscCheck='OK'|'NOT_CHECKED'|'AUTH_ERROR'|'SCOPE_INSUFFICIENT'|'PROPERTY_DENIED'|'API_ERROR'|SitemapErrorCategory;
export interface SitemapHealthRow {url:string;status:string;lastSuccessfulSubmission:string|null;lastAttempt:string|null;lastCheck:string|null;errorCategory:string|null;failureStage:string|null;httpStatus:number|null;retryAt:string|null;retryStatus:'SCHEDULED'|'DUE'|'BLOCKED'|'NONE';}
export interface GscHealth {
  checkedAt:string;analyticsRead:GscCheck;sitemapRead:GscCheck;sitemapWrite:GscCheck;
  authScopeStatus:'WEBMASTERS'|'READ_ONLY'|'UNKNOWN';
  propertyPermissionStatus:'siteOwner'|'siteFullUser'|'siteRestrictedUser'|'siteUnverifiedUser'|'UNKNOWN';
  configuredProperty:string;lastSuccessfulSitemapSubmission:string|null;lastSubmissionError:GscCheck|null;
  sitemapMaintenanceError?:SitemapErrorCategory|null;
  sitemaps?:SitemapHealthRow[];
}
export function emptyGscHealth(now=new Date()):GscHealth{return {checkedAt:now.toISOString(),analyticsRead:'NOT_CHECKED',sitemapRead:'NOT_CHECKED',sitemapWrite:'NOT_CHECKED',
  authScopeStatus:'UNKNOWN',propertyPermissionStatus:'UNKNOWN',configuredProperty:gscProperty(),lastSuccessfulSitemapSubmission:null,lastSubmissionError:null};}
export function classifyScope(scope:string):GscHealth['authScopeStatus']{
  const scopes=scope.split(/\s+/);return scopes.includes(GSC_WRITE_SCOPE)?'WEBMASTERS':scopes.includes(GSC_SCOPE)?'READ_ONLY':'UNKNOWN';
}
/** Only allowlisted codes escape this boundary, never Google's raw message/body/headers. */
export async function gscResponseStatus(response:Response):Promise<GscCheck>{
  if(response.ok)return 'OK';
  if(response.status===401)return 'AUTH_ERROR';
  if(response.status===403){
    const d=await googleDiagnostic(response,'PROPERTY');
    return d.reason==='SCOPE_INSUFFICIENT'?'SCOPE_INSUFFICIENT':['QUOTA_ERROR','RATE_LIMIT'].includes(d.category)?d.category:'PROPERTY_DENIED';
  }
  return response.status===404?'PROPERTY_DENIED':(await googleDiagnostic(response,'PROPERTY')).category;
}
/** Scheduled worker only. Dashboard reads the stored summary, never Google. */
export async function probeGscHealth(now:Date,fetcher:typeof fetch=fetch){
  const health=emptyGscHealth(now);let token:string|undefined;
  const credential=gscCredential();
  if(!credential)return {health,token};
  try{
    if(credential.kind==='OAUTH'){
      const grant=await refreshTokenGrant(credential,fetcher);token=grant.token;health.authScopeStatus=classifyScope(grant.scope);
    }else{token=await serviceAccountToken(credential,fetcher,now.getTime(),GSC_WRITE_SCOPE);health.authScopeStatus='WEBMASTERS';}
  }catch(e){const code=e instanceof GscApiError?(e.status>=500?'TRANSIENT_GOOGLE_ERROR':e.status===429?'RATE_LIMIT':'AUTH_ERROR'):'NETWORK_ERROR';health.analyticsRead=health.sitemapRead=health.sitemapWrite=code;return {health,token};}
  const headers={authorization:`Bearer ${token}`},base=`${GSC_API}/sites/${encodeURIComponent(health.configuredProperty)}`;
  const check=async(url:string,init:RequestInit={})=>{
    try{const response=await fetcher(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(15_000)});return {response,status:await gscResponseStatus(response.clone())};}
    catch{return {response:null,status:'NETWORK_ERROR' as const};}
  };
  const property=await check(base);
  if(property.status==='OK'){
    const body=await property.response!.json().catch(()=>({}));
    const levels=['siteOwner','siteFullUser','siteRestrictedUser','siteUnverifiedUser'];
    if(body&&typeof body==='object'&&body.siteUrl===health.configuredProperty&&levels.includes(body.permissionLevel))health.propertyPermissionStatus=body.permissionLevel;
  }
  const day=new Date(now.getTime()-3*86_400_000).toISOString().slice(0,10);
  health.analyticsRead=(await check(`${base}/searchAnalytics/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startDate:day,endDate:day,rowLimit:1,dataState:'final'})})).status;
  health.sitemapRead=(await check(`${base}/sitemaps`)).status;
  if(health.authScopeStatus==='READ_ONLY')health.sitemapWrite='SCOPE_INSUFFICIENT';
  else if(property.status!=='OK')health.sitemapWrite=property.status;
  else if(['siteRestrictedUser','siteUnverifiedUser'].includes(health.propertyPermissionStatus))health.sitemapWrite='PROPERTY_DENIED';
  return {health,token};
}

/** Existing run JSON is the durable evidence store: no credential or schema migration needed. */
export async function readGscHealth(db:QueryExecutor):Promise<GscHealth|null>{
  const row=(await db.query("SELECT summary->'gscHealth' AS health FROM seo_autopilot_runs WHERE summary ? 'gscHealth' AND summary->'gscHealth' <> 'null'::jsonb ORDER BY started_at DESC LIMIT 1")).rows[0];
  if(!row?.health)return null;
  const value=row.health as GscHealth;
  const sitemaps=(await db.query('SELECT path,state,submitted_at,attempted_at,checked_at,error_code,diagnostic,next_retry_at FROM seo_autopilot_sitemaps ORDER BY path')).rows;
  const date=(v:unknown)=>v?new Date(String(v)).toISOString():null;
  // Explicit field projection prevents any unrelated run payload reaching the dashboard.
  return {checkedAt:value.checkedAt,analyticsRead:value.analyticsRead,sitemapRead:value.sitemapRead,sitemapWrite:value.sitemapWrite,
    authScopeStatus:value.authScopeStatus,propertyPermissionStatus:value.propertyPermissionStatus,configuredProperty:value.configuredProperty,
    lastSuccessfulSitemapSubmission:value.lastSuccessfulSitemapSubmission,lastSubmissionError:value.lastSubmissionError,
    sitemapMaintenanceError:value.sitemapMaintenanceError??null,
    sitemaps:sitemaps.filter(r=>['/sitemap.xml','/sports-sitemaps.xml'].includes(String(r.path))).map(r=>({url:'https://livasports.com'+r.path,status:String(r.state),
      lastSuccessfulSubmission:date(r.submitted_at),lastAttempt:date(r.attempted_at),lastCheck:date(r.checked_at),errorCategory:r.error_code?String(r.error_code):null,
      failureStage:r.diagnostic?.stage??null,httpStatus:typeof r.diagnostic?.httpStatus==='number'?r.diagnostic.httpStatus:null,retryAt:date(r.next_retry_at),
      retryStatus:r.next_retry_at?(Date.parse(String(r.next_retry_at))<=Date.now()?'DUE':'SCHEDULED'):r.state==='BLOCKED'?'BLOCKED':'NONE'}))};
}
