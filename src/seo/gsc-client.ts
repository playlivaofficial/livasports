import 'server-only';
import {createSign} from 'node:crypto';
import {GSC_SCOPE,type GscCredential} from './gsc';

/**
 * Read-only Search Console API client.
 *
 * Only two endpoints are used and both are reads: `searchanalytics.query` and `sitemaps.list`. The scope
 * requested is `webmasters.readonly`, so this client cannot submit, remove or alter anything even if it
 * were asked to. Credentials are read from the environment by the caller and never logged: every error
 * path below returns a typed code, never the response body, which could echo a token.
 */
const TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
const API='https://searchconsole.googleapis.com/webmasters/v3';
/** Search Console caps a single Search Analytics response at 25 000 rows. */
export const GSC_MAX_ROWS=25_000;

export type GscFailure='AUTH_ERROR'|'PROPERTY_DENIED'|'API_ERROR';
export class GscApiError extends Error {
  constructor(readonly code:GscFailure,readonly status:number,message:string){super(message);this.name='GscApiError';}
}
type Fetcher=(url:string,init?:RequestInit)=>Promise<Response>;

const base64url=(value:Buffer|string)=>Buffer.from(value).toString('base64url');

/**
 * Service-account access token: a signed JWT exchanged for a bearer token. Google's own libraries do the
 * same thing; doing it here keeps the dependency surface at zero for two read endpoints.
 */
export async function serviceAccountToken(credential:{clientEmail:string;privateKey:string},fetcher:Fetcher=fetch,now=Date.now()):Promise<string>{
  const issued=Math.floor(now/1000);
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claims=base64url(JSON.stringify({iss:credential.clientEmail,scope:GSC_SCOPE,aud:TOKEN_ENDPOINT,iat:issued,exp:issued+3600}));
  let signature:string;
  try{
    const signer=createSign('RSA-SHA256');signer.update(`${header}.${claims}`);
    signature=signer.sign(credential.privateKey.replace(/\\n/g,'\n'),'base64url');
  }catch{throw new GscApiError('AUTH_ERROR',0,'Service-account private key could not sign the assertion');}
  const response=await fetcher(TOKEN_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${header}.${claims}.${signature}`})});
  if(!response.ok)throw new GscApiError('AUTH_ERROR',response.status,`Token exchange rejected the service account (${response.status})`);
  const token=(await response.json() as {access_token?:string}).access_token;
  if(!token)throw new GscApiError('AUTH_ERROR',response.status,'Token exchange returned no access token');
  return token;
}

/** OAuth access token from a stored refresh token. */
export async function refreshTokenAccess(credential:{clientId:string;clientSecret:string;refreshToken:string},fetcher:Fetcher=fetch):Promise<string>{
  const response=await fetcher(TOKEN_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',client_id:credential.clientId,client_secret:credential.clientSecret,refresh_token:credential.refreshToken})});
  if(!response.ok)throw new GscApiError('AUTH_ERROR',response.status,`Refresh token was rejected (${response.status})`);
  const token=(await response.json() as {access_token?:string}).access_token;
  if(!token)throw new GscApiError('AUTH_ERROR',response.status,'Refresh exchange returned no access token');
  return token;
}

export async function accessTokenFor(credential:GscCredential,fetcher:Fetcher=fetch,now=Date.now()):Promise<string>{
  return credential.kind==='SERVICE_ACCOUNT'
    ?serviceAccountToken(credential,fetcher,now)
    :refreshTokenAccess(credential,fetcher);
}

/** 401/403 are told apart because they need different owner actions: re-issue a key vs grant the property. */
function failureFor(status:number):GscFailure{
  if(status===401)return 'AUTH_ERROR';
  if(status===403||status===404)return 'PROPERTY_DENIED';
  return 'API_ERROR';
}

export interface SearchAnalyticsRow {keys:string[];clicks:number;impressions:number;ctr:number;position:number}
export interface SearchAnalyticsQuery {
  startDate:string;endDate:string;dimensions:string[];
  rowLimit?:number;dimensionFilterGroups?:unknown[];dataState?:'final'|'all';
}

/**
 * One Search Analytics report, paginated to completion.
 *
 * Google returns at most 25 000 rows per call, so a page/query report for a site this size can exceed one
 * response. Paging with `startRow` until a short page arrives is the documented way to read all of it; the
 * `maxRows` ceiling keeps a serverless invocation bounded and is reported by the caller rather than
 * silently truncating.
 */
export async function searchAnalytics(token:string,property:string,query:SearchAnalyticsQuery,
  options:{fetcher?:Fetcher;maxRows?:number}={}):Promise<{rows:SearchAnalyticsRow[];truncated:boolean}>{
  const fetcher=options.fetcher??fetch;
  const pageSize=Math.min(query.rowLimit??GSC_MAX_ROWS,GSC_MAX_ROWS);
  const ceiling=options.maxRows??GSC_MAX_ROWS;
  const rows:SearchAnalyticsRow[]=[];
  for(let startRow=0;rows.length<ceiling;startRow+=pageSize){
    const response=await fetcher(`${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      // dataState 'final' excludes Google's still-settling recent days, so comparisons are like-for-like.
      body:JSON.stringify({...query,dataState:query.dataState??'final',rowLimit:pageSize,startRow})});
    if(!response.ok)throw new GscApiError(failureFor(response.status),response.status,`Search Analytics returned ${response.status}`);
    const page=(await response.json() as {rows?:SearchAnalyticsRow[]}).rows??[];
    rows.push(...page);
    if(page.length<pageSize)return {rows,truncated:false};
  }
  return {rows:rows.slice(0,ceiling),truncated:true};
}

export interface GscSitemap {path:string;lastSubmitted:string|null;lastDownloaded:string|null;isPending:boolean|null;
  warnings:number;errors:number;submitted:number;indexed:number|null}

/**
 * Submitted sitemaps as Search Console itself records them. This is the only indexing-adjacent figure the
 * API exposes: `submitted` is how many URLs Google read from the sitemap. It is NOT an indexed count —
 * the Page Indexing report ("Discovered/Crawled – currently not indexed") has no public API at all.
 */
export async function listSitemaps(token:string,property:string,fetcher:Fetcher=fetch):Promise<GscSitemap[]>{
  const response=await fetcher(`${API}/sites/${encodeURIComponent(property)}/sitemaps`,{headers:{authorization:`Bearer ${token}`}});
  if(!response.ok)throw new GscApiError(failureFor(response.status),response.status,`Sitemaps returned ${response.status}`);
  const body=await response.json() as {sitemap?:Array<Record<string,unknown>>};
  return (body.sitemap??[]).map(entry=>{
    const contents=(entry.contents as Array<{submitted?:string;indexed?:string}>|undefined)??[];
    const submitted=contents.reduce((total,row)=>total+Number(row.submitted??0),0);
    const indexed=contents.reduce((total,row)=>total+Number(row.indexed??0),0);
    return {path:String(entry.path??''),lastSubmitted:entry.lastSubmitted?String(entry.lastSubmitted):null,
      lastDownloaded:entry.lastDownloaded?String(entry.lastDownloaded):null,
      isPending:entry.isPending===undefined?null:Boolean(entry.isPending),
      warnings:Number(entry.warnings??0),errors:Number(entry.errors??0),
      submitted,indexed:contents.some(row=>row.indexed!==undefined)?indexed:null};
  });
}
