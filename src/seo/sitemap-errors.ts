/** Safe, finite diagnostic vocabulary. Never persist Google's arbitrary messages or headers. */
export type SitemapErrorCategory='AUTH_ERROR'|'PERMISSION_ERROR'|'QUOTA_ERROR'|'RATE_LIMIT'|'INVALID_PROPERTY'|'INVALID_SITEMAP'|'TRANSIENT_GOOGLE_ERROR'|'NETWORK_ERROR'|'UNKNOWN_ERROR';
export type SitemapStage='AUTH'|'PROPERTY'|'FETCH'|'VALIDATE'|'SUBMIT'|'READBACK'|'PERSIST';
export interface SitemapDiagnostic {category:SitemapErrorCategory;stage:SitemapStage;httpStatus:number|null;reason:string;retryAfterSeconds:number|null;}
export class SitemapError extends Error {
  constructor(readonly diagnostic:SitemapDiagnostic){super(diagnostic.category);this.name='SitemapError';}
}
export function sitemapError(category:SitemapErrorCategory,stage:SitemapStage,reason:string,httpStatus:number|null=null,retryAfterSeconds:number|null=null){
  return new SitemapError({category,stage,reason,httpStatus,retryAfterSeconds});
}
export function networkDiagnostic(error:unknown,stage:SitemapStage):SitemapDiagnostic{
  if(error instanceof SitemapError)return error.diagnostic;
  const name=error instanceof Error?error.name:'';
  return {category:stage==='PERSIST'?'UNKNOWN_ERROR':'NETWORK_ERROR',stage,httpStatus:null,reason:['AbortError','TimeoutError'].includes(name)?'TIMEOUT':stage==='PERSIST'?'PERSISTENCE_FAILED':'CONNECTION_FAILED',retryAfterSeconds:null};
}
export function retryAfter(response:Response,now=Date.now()){
  const v=response.headers.get('retry-after');if(!v)return null;
  const seconds=/^\d+$/.test(v)?Number(v):Math.ceil((Date.parse(v)-now)/1000);
  return Number.isFinite(seconds)?Math.max(0,Math.min(seconds,7*86400)):null;
}
export async function googleDiagnostic(response:Response,stage:SitemapStage):Promise<SitemapDiagnostic>{
  const body=await response.json().catch(()=>null) as {error?:{status?:string;message?:string;details?:Array<{reason?:string}>;errors?:Array<{reason?:string}>}}|null;
  const reasons=[...(body?.error?.details??[]),...(body?.error?.errors??[])].map(r=>r.reason??'');
  const scope=reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')||/insufficient authentication scopes/i.test(body?.error?.message??'');
  const quota=reasons.some(r=>/quota|dailyLimit/i.test(r));
  const rate=response.status===429||reasons.some(r=>/rateLimit/i.test(r));
  const category:SitemapErrorCategory=response.status===401?'AUTH_ERROR':scope?'PERMISSION_ERROR':quota?'QUOTA_ERROR':rate?'RATE_LIMIT':response.status===403?'PERMISSION_ERROR':response.status===404?'INVALID_PROPERTY':response.status>=500?'TRANSIENT_GOOGLE_ERROR':response.status===400?(stage==='PROPERTY'?'INVALID_PROPERTY':'INVALID_SITEMAP'):'UNKNOWN_ERROR';
  return {category,stage,httpStatus:response.status,reason:scope?'SCOPE_INSUFFICIENT':quota?'QUOTA_EXCEEDED':rate?'RATE_LIMITED':response.status===403?'ACCESS_DENIED':response.status===401?'TOKEN_REJECTED':response.status===404?'PROPERTY_NOT_FOUND':response.status>=500?'GOOGLE_UNAVAILABLE':response.status===400?'INVALID_ARGUMENT':'UNCLASSIFIED_RESPONSE',retryAfterSeconds:retryAfter(response)};
}
export const permanentFailure=(category:string)=>['AUTH_ERROR','PERMISSION_ERROR','INVALID_PROPERTY','INVALID_SITEMAP'].includes(category);
/** One write at most per root/cycle. Retries occur on later scheduled cycles, never a tight PUT loop. */
export function nextSitemapRetry(d:SitemapDiagnostic,failures:number,now:Date):Date|null{
  if(permanentFailure(d.category))return null;
  const seconds=d.category==='QUOTA_ERROR'?86400:Math.min(86400,3600*2**Math.min(5,Math.max(0,failures-1)));
  return new Date(now.getTime()+Math.max(seconds,d.retryAfterSeconds??0)*1000);
}
