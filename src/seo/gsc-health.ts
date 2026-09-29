import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscCredential,gscProperty,GSC_SCOPE} from './gsc';
import {refreshTokenGrant,serviceAccountToken} from './gsc-client';

export const GSC_WRITE_SCOPE='https://www.googleapis.com/auth/webmasters';
export const GSC_API='https://searchconsole.googleapis.com/webmasters/v3';
export type GscCheck='OK'|'NOT_CHECKED'|'AUTH_ERROR'|'SCOPE_INSUFFICIENT'|'PROPERTY_DENIED'|'API_ERROR';
export interface GscHealth {
  checkedAt:string;analyticsRead:GscCheck;sitemapRead:GscCheck;sitemapWrite:GscCheck;
  authScopeStatus:'WEBMASTERS'|'READ_ONLY'|'UNKNOWN';
  propertyPermissionStatus:'siteOwner'|'siteFullUser'|'siteRestrictedUser'|'siteUnverifiedUser'|'UNKNOWN';
  configuredProperty:string;lastSuccessfulSitemapSubmission:string|null;lastSubmissionError:GscCheck|null;
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
    const body=await response.json().catch(()=>null) as {error?:{details?:Array<{reason?:string}>;message?:string}}|null;
    if(body?.error?.details?.some(d=>d.reason==='ACCESS_TOKEN_SCOPE_INSUFFICIENT')||/insufficient authentication scopes/i.test(body?.error?.message??''))return 'SCOPE_INSUFFICIENT';
    return 'PROPERTY_DENIED';
  }
  return response.status===404?'PROPERTY_DENIED':'API_ERROR';
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
  }catch{health.analyticsRead=health.sitemapRead=health.sitemapWrite='AUTH_ERROR';return {health,token};}
  const headers={authorization:`Bearer ${token}`},base=`${GSC_API}/sites/${encodeURIComponent(health.configuredProperty)}`;
  const check=async(url:string,init:RequestInit={})=>{
    try{const response=await fetcher(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(15_000)});return {response,status:await gscResponseStatus(response.clone())};}
    catch{return {response:null,status:'API_ERROR' as const};}
  };
  const property=await check(base);
  if(property.status==='OK'){
    const body=await property.response!.json().catch(()=>({}));
    const levels=['siteOwner','siteFullUser','siteRestrictedUser','siteUnverifiedUser'];
    if(body.siteUrl===health.configuredProperty&&levels.includes(body.permissionLevel))health.propertyPermissionStatus=body.permissionLevel;
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
  // Explicit field projection prevents any unrelated run payload reaching the dashboard.
  return {checkedAt:value.checkedAt,analyticsRead:value.analyticsRead,sitemapRead:value.sitemapRead,sitemapWrite:value.sitemapWrite,
    authScopeStatus:value.authScopeStatus,propertyPermissionStatus:value.propertyPermissionStatus,configuredProperty:value.configuredProperty,
    lastSuccessfulSitemapSubmission:value.lastSuccessfulSitemapSubmission,lastSubmissionError:value.lastSubmissionError};
}
