import 'server-only';
import {createHmac} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';

export interface OwnerLoginLimiter {
  check(request:Request):Promise<number|null>;
  failure(request:Request):Promise<number|null>;
  success(request:Request):Promise<void>;
}

const windowSeconds=15*60,maximumFailures=5;
function source(request:Request){
  const forwarded=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??'unknown';
  return forwarded.split(',')[0]!.trim().toLowerCase().slice(0,128)||'unknown';
}
function bucket(request:Request){
  return createHmac('sha256',process.env.OWNER_QA_SESSION_SECRET!).update('livasports:owner:rate-limit:v1:'+source(request),'utf8').digest('hex');
}
function retrySeconds(value:Date|string|null){return value?Math.max(1,Math.ceil((new Date(value).getTime()-Date.now())/1000)):null;}

export const productionOwnerLoginLimiter:OwnerLoginLimiter={
  async check(request){
    const url=databaseUrl();if(!url)throw new Error('OWNER_RATE_LIMIT_UNAVAILABLE');
    const database=new PostgresDatabaseClient(url);
    try{
      const result=await database.query<{blocked_until:Date|null}>(`SELECT blocked_until FROM owner_qa_login_rate_limits
        WHERE bucket_hash=$1 AND blocked_until > now()`,[bucket(request)]);
      return retrySeconds(result.rows[0]?.blocked_until??null);
    }finally{await database.close();}
  },
  async failure(request){
    const url=databaseUrl();if(!url)throw new Error('OWNER_RATE_LIMIT_UNAVAILABLE');
    const database=new PostgresDatabaseClient(url);
    try{
      const result=await database.query<{blocked_until:Date|null}>(`INSERT INTO owner_qa_login_rate_limits
          (bucket_hash,window_started_at,failed_count,blocked_until,updated_at) VALUES ($1,now(),1,NULL,now())
        ON CONFLICT (bucket_hash) DO UPDATE SET
          window_started_at=CASE WHEN owner_qa_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN now() ELSE owner_qa_login_rate_limits.window_started_at END,
          failed_count=CASE WHEN owner_qa_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN 1 ELSE owner_qa_login_rate_limits.failed_count+1 END,
          blocked_until=CASE WHEN (CASE WHEN owner_qa_login_rate_limits.window_started_at <= now()-($2::int*interval '1 second') THEN 1 ELSE owner_qa_login_rate_limits.failed_count+1 END) >= $3 THEN now()+($2::int*interval '1 second') ELSE owner_qa_login_rate_limits.blocked_until END,
          updated_at=now()
        RETURNING blocked_until`,[bucket(request),windowSeconds,maximumFailures]);
      return retrySeconds(result.rows[0]?.blocked_until??null);
    }finally{await database.close();}
  },
  async success(request){
    const url=databaseUrl();if(!url)throw new Error('OWNER_RATE_LIMIT_UNAVAILABLE');
    const database=new PostgresDatabaseClient(url);
    try{await database.query('DELETE FROM owner_qa_login_rate_limits WHERE bucket_hash=$1',[bucket(request)]);}
    finally{await database.close();}
  },
};
