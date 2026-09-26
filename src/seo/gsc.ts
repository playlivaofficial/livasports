/**
 * Search Console connector.
 *
 * There is no Search Console credential in this project. `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` exist but
 * are the NextAuth sign-in client: they carry no Search Console scope and no property grant, so using them
 * would not return data. Rather than fabricate metrics, this module reports NOT_CONNECTED and states
 * exactly what is missing, and the owner UI renders that state instead of numbers.
 *
 * To connect, the owner supplies one of:
 *   - a Google service account added as a user on the `sc-domain:livasports.com` property, with its JSON
 *     key in `GSC_SERVICE_ACCOUNT_JSON`; or
 *   - an OAuth refresh token for an account with access to that property, scope
 *     `https://www.googleapis.com/auth/webmasters.readonly`, in `GSC_REFRESH_TOKEN`.
 * Only then does this module read the Search Analytics API. Nothing here writes placeholder rows.
 */
const DEFAULT_PROPERTY='sc-domain:livasports.com';
/** Domain property by default; an account that only holds the URL-prefix property sets GSC_PROPERTY. */
export function gscProperty(env:{GSC_PROPERTY?:string}=process.env as {GSC_PROPERTY?:string}){
  const value=(env.GSC_PROPERTY??'').trim();
  return value||DEFAULT_PROPERTY;
}
export const GSC_PROPERTY=DEFAULT_PROPERTY;
export const GSC_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';

export type GscState='CONNECTED'|'NOT_CONNECTED'|'MISCONFIGURED'|'AUTH_ERROR'|'PROPERTY_DENIED'|'API_ERROR';
/** Parsed credential. Values live only in memory and are never logged or rendered. */
export type GscCredential=
  {kind:'SERVICE_ACCOUNT';clientEmail:string;privateKey:string}|
  {kind:'OAUTH';clientId:string;clientSecret:string;refreshToken:string};
export interface GscStatus {
  state:GscState;
  property:string;
  /** Present when not connected: precisely which access is absent. */
  missing?:string;
  /** How an owner fixes it, in one line. */
  remedy?:string;
  checkedAt:string;
}
export interface GscTotals {clicks:number;impressions:number;ctr:number;position:number}
export interface GscReport {status:GscStatus;totals:GscTotals|null;previous:GscTotals|null;
  topQueries:Array<{query:string;clicks:number;impressions:number;ctr:number;position:number}>;
  topPages:Array<{page:string;clicks:number;impressions:number;ctr:number;position:number}>;
  countries:Array<{country:string;clicks:number;impressions:number}>;
  devices:Array<{device:string;clicks:number;impressions:number}>;}

type Env={GSC_SERVICE_ACCOUNT_JSON?:string;GSC_REFRESH_TOKEN?:string;GSC_CLIENT_ID?:string;GSC_CLIENT_SECRET?:string;GSC_PROPERTY?:string};

export function gscStatus(env:Env=process.env as Env,now=new Date()):GscStatus{
  const checkedAt=now.toISOString();
  if(env.GSC_SERVICE_ACCOUNT_JSON){
    try{
      const parsed=JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON) as {client_email?:string;private_key?:string};
      if(parsed.client_email&&parsed.private_key)return {state:'CONNECTED',property:GSC_PROPERTY,checkedAt};
      return {state:'MISCONFIGURED',property:GSC_PROPERTY,checkedAt,
        missing:'GSC_SERVICE_ACCOUNT_JSON is present but has no client_email/private_key',
        remedy:'Re-export the service-account key JSON and set it again'};
    }catch{return {state:'MISCONFIGURED',property:GSC_PROPERTY,checkedAt,
      missing:'GSC_SERVICE_ACCOUNT_JSON is not valid JSON',remedy:'Set the raw service-account key JSON'};}
  }
  if(env.GSC_REFRESH_TOKEN){
    if(env.GSC_CLIENT_ID&&env.GSC_CLIENT_SECRET)return {state:'CONNECTED',property:GSC_PROPERTY,checkedAt};
    return {state:'MISCONFIGURED',property:GSC_PROPERTY,checkedAt,
      missing:'GSC_REFRESH_TOKEN is set without GSC_CLIENT_ID/GSC_CLIENT_SECRET',
      remedy:'Add the OAuth client id and secret the refresh token belongs to'};
  }
  return {state:'NOT_CONNECTED',property:GSC_PROPERTY,checkedAt,
    missing:`No Search Console credential. Needs a service account added as a user on ${GSC_PROPERTY} (GSC_SERVICE_ACCOUNT_JSON) or an OAuth refresh token with ${GSC_SCOPE} (GSC_REFRESH_TOKEN + GSC_CLIENT_ID + GSC_CLIENT_SECRET).`,
    remedy:`Grant the credential access to ${GSC_PROPERTY} in Search Console, then set the environment variable.`};
}

export const EMPTY_GSC_REPORT=(status:GscStatus):GscReport=>({status,totals:null,previous:null,topQueries:[],topPages:[],countries:[],devices:[]});

/**
 * Read Search Analytics. Returns an empty report whenever a credential is absent or invalid — callers
 * render `status.state`, never a zero, so "no data" is visibly different from "zero clicks".
 */
export async function readGscReport(env:Env=process.env as Env,now=new Date()):Promise<GscReport>{
  const status=gscStatus(env,now);
  if(status.state!=='CONNECTED')return EMPTY_GSC_REPORT(status);
  // Deliberately not implemented against a credential that has never existed in this project: shipping an
  // untested API client would be the kind of speculative code this milestone is meant to avoid. The state
  // machine, storage and UI are complete, so wiring the fetch is a contained follow-up once access exists.
  return EMPTY_GSC_REPORT({...status,state:'MISCONFIGURED',
    missing:'A credential is configured but the Search Analytics client is not implemented yet',
    remedy:'Implement readGscReport against the configured credential'});
}

/**
 * Parse whichever credential is configured, without ever throwing its contents. Returns null when nothing
 * is configured, which the caller renders as NOT_CONNECTED rather than as an error.
 */
export function gscCredential(env:Env=process.env as Env):GscCredential|null{
  if(env.GSC_SERVICE_ACCOUNT_JSON){
    try{
      const parsed=JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON) as {client_email?:string;private_key?:string};
      if(parsed.client_email&&parsed.private_key)
        return {kind:'SERVICE_ACCOUNT',clientEmail:parsed.client_email,privateKey:parsed.private_key};
    }catch{/* Reported as MISCONFIGURED by gscStatus; never echo the value. */}
    return null;
  }
  if(env.GSC_REFRESH_TOKEN&&env.GSC_CLIENT_ID&&env.GSC_CLIENT_SECRET)
    return {kind:'OAUTH',clientId:env.GSC_CLIENT_ID,clientSecret:env.GSC_CLIENT_SECRET,refreshToken:env.GSC_REFRESH_TOKEN};
  return null;
}
