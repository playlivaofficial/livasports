import 'server-only';
import {createHmac} from 'node:crypto';
import {authDatabase} from './database';

const windowSeconds=15*60;
const maximumAttempts=5;

function source(request:Request){
  const forwarded=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??'unknown';
  return forwarded.split(',')[0]!.trim().toLowerCase().slice(0,128)||'unknown';
}

function secret():string {
  const value=process.env.AUTH_SECRET?.trim();
  if(!value||value.length<32)throw new Error('AUTH_NOT_CONFIGURED');
  return value;
}

export function emailLoginBucket(request:Request,email:string):string {
  return createHmac('sha256',secret()).update('livasports:user-email-login:v1:'+source(request)+':'+email,'utf8').digest('hex');
}

function retrySeconds(value:Date|string|null){return value?Math.max(1,Math.ceil((new Date(value).getTime()-Date.now())/1000)):null;}

export async function emailLoginAllowed(request:Request,email:string):Promise<{allowed:boolean;retryAfter:number|null}> {
  // Independent source and recipient budgets prevent changing an address/IP from bypassing the pair limit.
  // HMACs only: neither IPs nor email addresses are stored in the limiter table.
  for(const [scope,value,maximum] of [['source',source(request),20],['recipient',email,5],['pair',source(request)+':'+email,maximumAttempts]] as const){
    const bucket=createHmac('sha256',secret()).update(`livasports:user-email-login:v2:${scope}:${value}`,'utf8').digest('hex');
    const result=await consumeBucket(bucket,maximum);
    if(!result.allowed)return result;
  }
  return {allowed:true,retryAfter:null};
}

async function consumeBucket(bucket:string,maximum:number):Promise<{allowed:boolean;retryAfter:number|null}> {
  const database=authDatabase();
  const blocked=await database.query<{blocked_until:Date|null}>(
    'SELECT blocked_until FROM auth_email_login_rate_limits WHERE bucket_hash=$1 AND blocked_until > now()',[bucket]);
  const retry=retrySeconds(blocked.rows[0]?.blocked_until??null);
  if(retry)return {allowed:false,retryAfter:retry};
  const result=await database.query<{blocked_until:Date|null}>(
    `INSERT INTO auth_email_login_rate_limits (bucket_hash,window_started_at,attempt_count,blocked_until,updated_at)
       VALUES ($1,now(),1,NULL,now())
     ON CONFLICT (bucket_hash) DO UPDATE SET
       window_started_at=CASE WHEN auth_email_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN now() ELSE auth_email_login_rate_limits.window_started_at END,
       attempt_count=CASE WHEN auth_email_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN 1 ELSE auth_email_login_rate_limits.attempt_count+1 END,
       blocked_until=CASE WHEN (CASE WHEN auth_email_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN 1 ELSE auth_email_login_rate_limits.attempt_count+1 END) >= $3
         THEN now()+($2::int*interval '1 second') ELSE auth_email_login_rate_limits.blocked_until END,
       updated_at=now()
    RETURNING blocked_until`,[bucket,windowSeconds,maximum]);
  const next=retrySeconds(result.rows[0]?.blocked_until??null);
  return {allowed:!next,retryAfter:next};
}

