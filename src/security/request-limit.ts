import 'server-only';
import {createHmac,randomBytes} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient,type QueryExecutor} from '@/database/client';

export const REQUEST_LIMITS={auth:40,search:90,events:60,favorites:90,owner:12,slip:90,read:180} as const;
export type RequestLimitScope=keyof typeof REQUEST_LIMITS;
const windowMs=60_000;
const localKey=randomBytes(32).toString('hex');
let database:PostgresDatabaseClient|null=null;
const bursts=new Map<string,{count:number;until:number}>();
let cleanupAt=0;

export function requestBucket(request:Request,scope:RequestLimitScope,secret:string):string {
  const source=(request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??'unknown').split(',')[0].trim().slice(0,128);
  return createHmac('sha256',secret).update(`livasports:request-limit:v1:${scope}:${source}`).digest('hex');
}

export async function consumeRequestLimit(db:QueryExecutor,bucket:string,maximum:number):Promise<number|null>{
  const result=await db.query<{allowed:boolean;retry_after:number}>(`INSERT INTO request_rate_limits(bucket_hash,window_started_at,attempts,expires_at)
    VALUES($1,now(),1,now()+interval '1 minute')
    ON CONFLICT(bucket_hash) DO UPDATE SET
      window_started_at=CASE WHEN request_rate_limits.expires_at<=now() THEN now() ELSE request_rate_limits.window_started_at END,
      attempts=CASE WHEN request_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(request_rate_limits.attempts+1,$2+1) END,
      expires_at=CASE WHEN request_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE request_rate_limits.expires_at END
    RETURNING attempts<=$2 AS allowed,GREATEST(1,ceil(extract(epoch FROM (expires_at-now()))))::int AS retry_after`,[bucket,maximum]);
  if(!result.rows[0])throw new Error('LIMITER_UNAVAILABLE');
  return result.rows[0].allowed?null:result.rows[0].retry_after;
}

/** Fast bounded per-instance shield + atomic cross-instance counters. Never touches a provider. */
export async function requestLimit(request:Request,scope:RequestLimitScope):Promise<Response|null>{
  const now=Date.now(),maximum=REQUEST_LIMITS[scope];
  const secret=process.env.AUTH_SECRET?.trim()||(process.env.VERCEL==='1'?null:localKey);
  const reply=(status:number,retry:number)=>Response.json({error:status===429?'RATE_LIMITED':'TEMPORARILY_UNAVAILABLE',providerRequests:0},
    {status,headers:{'Cache-Control':'private, no-store','Retry-After':String(retry)}});
  if(!secret)return reply(503,60);
  const bucket=requestBucket(request,scope,secret),old=bursts.get(bucket);
  if(old&&old.until>now){if(old.count>=maximum)return reply(429,Math.ceil((old.until-now)/1000));old.count++;}
  else {
    if(bursts.size>=10_000)for(const [key,value] of bursts)if(value.until<=now)bursts.delete(key);
    if(bursts.size>=10_000)return reply(429,60);
    bursts.set(bucket,{count:1,until:now+windowMs});
  }
  try{
    const url=databaseUrl();if(!url)return reply(503,60);
    database??=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5_000});
    const retry=await consumeRequestLimit(database,bucket,maximum);
    if(retry)return reply(429,retry);
    if(now>=cleanupAt){
      cleanupAt=now+10*60_000;
      // At most 5k expired counters per pass, including across a cold-start burst.
      await database.query(`DELETE FROM request_rate_limits WHERE bucket_hash IN
        (SELECT bucket_hash FROM request_rate_limits WHERE expires_at<now()-interval '1 hour' ORDER BY expires_at LIMIT 5000)`);
    }
    return null;
  }catch{return reply(503,60);}
}

export function withRequestLimit(scope:RequestLimitScope,handler:(request:Request)=>Promise<Response>){
  return async(request:Request)=>await requestLimit(request,scope)??handler(request);
}
