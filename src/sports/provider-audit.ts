import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {readSportsCapture,writeSportsCapture} from './private-cache';
import type {QueryExecutor} from '@/database/client';

export interface SportsRateLimit {entity:string;remaining:number;hardLimit:number|null;resetsAt:string;observedAt:string;}
export interface SportsEnvelope<T> { data:T[]; status:number; hasMore:boolean; checkedAt:string; rateLimit?:SportsRateLimit; }
export class SportsProviderError extends Error {
  constructor(readonly status:number){super(`Sports provider HTTP ${status}`);}
}

/** Backend CLI only. A durable counter is incremented BEFORE each HTTP attempt. */
export class SportsAuditProvider {
  requests=0;
  private halted:SportsProviderError|null=null;
  private limits=new Map<string,SportsRateLimit>();
  private entities=new Map<string,string>();
  rateLimits(){return [...this.limits.values()];}
  constructor(private readonly key:string,private readonly db:QueryExecutor,private readonly runId:string,
    private readonly cacheDirectory='output/sports-provider-private',private readonly transport:typeof fetch=fetch,private readonly options:{refresh?:boolean}={}) {
    if(!key)throw new Error('Sports provider credential is not configured');
  }
  async page<T>(path:string,query:Record<string,string>={},refresh=false):Promise<SportsEnvelope<T>>{
    if(!/^football\/[a-z0-9/,-]+$/i.test(path)||/odds|predictions|premium/i.test(path))throw new Error('Unsupported sports audit endpoint');
    const url=new URL(path,'https://api.sportmonks.com/v3/');
    for(const [name,value] of Object.entries(query)){
      if(!['include','filters','page','per_page','order'].includes(name)||/odds|predictions/i.test(value))throw new Error('Unsupported sports audit query');
      url.searchParams.set(name,value);
    }
    const hash=createHash('sha256').update(url.pathname+url.search).digest('hex');
    const file=`${this.cacheDirectory}/${hash}.json`;
    if(!refresh&&!this.options.refresh)try{
      const cached=JSON.parse(await readSportsCapture(file)) as SportsEnvelope<T>;
      if(Date.now()-Date.parse(cached.checkedAt)<24*60*60*1000)return cached;
    }catch{/* Missing/expired checkpoints are fetched again. */}
    if(this.halted)throw this.halted;
    const endpoint=path.split('/')[1],entity=this.entities.get(endpoint),known=entity?this.limits.get(entity):undefined;
    if(known&&Date.parse(known.resetsAt)>Date.now()){
      if(known.remaining<=0)throw new SportsProviderError(429);
      known.remaining--;
    }
    await this.db.query('UPDATE ingestion_sync_runs SET provider_requests=provider_requests+1 WHERE id=$1',[this.runId]);
    this.requests++;
    let response:Response;
    try{response=await this.transport(url,{headers:{Authorization:this.key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});}
    catch{throw new SportsProviderError(0);}
    // Never serialize provider errors: they can echo authenticated request information.
    const body=await response.json().catch(()=>({})) as {data?:T[]|T;pagination?:{has_more?:boolean};rate_limit?:{requested_entity?:unknown;remaining?:unknown;resets_in_seconds?:unknown}};
    const quota=body.rate_limit,limitHeader=response.headers.get('x-ratelimit-limit');
    let rateLimit:SportsRateLimit|undefined;
    if(quota&&typeof quota.requested_entity==='string'&&/^[A-Za-z][A-Za-z ]{0,60}$/.test(quota.requested_entity)&&typeof quota.remaining==='number'&&Number.isSafeInteger(quota.remaining)&&quota.remaining>=0&&typeof quota.resets_in_seconds==='number'&&Number.isFinite(quota.resets_in_seconds)&&quota.resets_in_seconds>=0){
      rateLimit={entity:quota.requested_entity,remaining:quota.remaining,hardLimit:limitHeader&&/^\d+$/.test(limitHeader)?Number(limitHeader):null,resetsAt:new Date(Date.now()+quota.resets_in_seconds*1000).toISOString(),observedAt:new Date().toISOString()};
      this.limits.set(rateLimit.entity,rateLimit);
      this.entities.set(endpoint,rateLimit.entity);
    }
    if([401,429].includes(response.status)||response.status>=500){this.halted=new SportsProviderError(response.status);throw this.halted;}
    if(response.ok&&!('data' in body))throw new SportsProviderError(502);
    const result:SportsEnvelope<T>={data:Array.isArray(body.data)?body.data:body.data?[body.data]:[],status:response.status,
      hasMore:body.pagination?.has_more===true,checkedAt:new Date().toISOString(),...(rateLimit?{rateLimit}:{})};
    await mkdir(this.cacheDirectory,{recursive:true});
    await writeSportsCapture(file,JSON.stringify(result));
    return result;
  }
  async all<T>(path:string,query:Record<string,string>={}):Promise<SportsEnvelope<T>>{
    const rows:T[]=[];let page=1;const seen=new Set<string>();
    for(;;){
      const result=await this.page<T>(path,{...query,per_page:'50',page:String(page)});
      if(result.status!==200){
        if(rows.length)throw new SportsProviderError(result.status);
        return result;
      }
      const fingerprint=createHash('sha256').update(JSON.stringify(result.data)).digest('hex');
      if(result.hasMore&&(!result.data.length||seen.has(fingerprint)))throw new Error('Provider pagination did not advance');
      seen.add(fingerprint);rows.push(...result.data);
      if(!result.hasMore)return {...result,data:rows};
      page++;
    }
  }
}
