import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@/database/client';
import type { OddsProvider, OddsSnapshot } from '@/odds/types';
import { normalizeM5Snapshot } from './m5-normalizer';
import {reserveOddsRequest,verifiedAccountPeriod} from '@/odds/budget';

export class M5OddsPapiAdapter implements OddsProvider {
  private used=0;
  constructor(private readonly database:DatabaseClient,private readonly key:string,private readonly jobId:string,private readonly runCap=4,
    private readonly routine=false,private readonly deadline=Date.now()+140000){
    if(!key||!Number.isInteger(runCap)||runCap<1||runCap>6)throw new Error('INVALID_ODDS_WORKER_CONFIG');
  }
  requestCount(){return this.used;}
  private async request(bookmaker:string,tournamentIds:readonly string[],attempt=0,account=false):Promise<{data:unknown;observedAt:string}> {
    const endpoint=account?'/v4/account':'/v4/odds-by-tournaments';
    const query:Record<string,string>=account?{}:{bookmaker,tournamentIds:tournamentIds.join(','),language:'en',verbosity:'3',oddsFormat:'decimal'};
    if(!account&&(!['betano.bet.br','betsson'].includes(bookmaker)||!tournamentIds.length||tournamentIds.some(id=>!['325','27464','17','384'].includes(id))))throw new Error('OUT_OF_SCOPE_ODDS_REQUEST');
    if(this.used>=this.runCap)throw new Error('ODDS_RUN_CAP_REACHED');
    if(Date.now()+35000>this.deadline)throw new Error('ODDS_RUN_DEADLINE');
    const latest=await this.database.query('SELECT max(started_at) AS at FROM odds_provider_requests');
    const wait=latest.rows[0].at?Math.max(0,2500-(Date.now()-latest.rows[0].at.getTime())):0;
    if(wait)await new Promise(resolve=>setTimeout(resolve,Math.min(wait,2500)));
    const id=randomUUID();
    await this.database.transaction(tx=>reserveOddsRequest(tx,{id,jobId:this.jobId,endpoint,query,routine:this.routine,unmetered:account}));
    this.used++;
    const url=new URL(`https://api.oddspapi.io${endpoint}`);Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,v));url.searchParams.set('apiKey',this.key);
    let status:number|null=null;
    try {
      const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});status=response.status;
      const rawBody=await response.text();
      const body:unknown=(()=>{try{return JSON.parse(rawBody);}catch{return {message:rawBody};}})();const observedAt=new Date().toISOString();
      await this.database.query('UPDATE odds_provider_requests SET http_status=$2,completed_at=$3,outcome=$4 WHERE id=$1',[id,status,observedAt,response.ok?'SUCCEEDED':'HTTP_ERROR']);
      if(!response.ok){
        // Full body is redacted before it can reach an operator; no URL/auth header is logged.
        const safe=JSON.stringify(body, (key,value)=>/api.?key|token|secret|authorization|email/i.test(key)?'[REDACTED]':value).split(this.key).join('[REDACTED]');
        throw new Error(JSON.stringify({status,endpoint,query,body:JSON.parse(safe)}));
      }
      return {data:body,observedAt};
    }catch(error){
      if(status===null)await this.database.query("UPDATE odds_provider_requests SET completed_at=now(),outcome='NETWORK_ERROR' WHERE id=$1",[id]);
      if(!account&&(status===429||status===null||(status>=500&&status<600))&&this.used<this.runCap&&attempt<1&&Date.now()+45000<this.deadline){
        await new Promise(resolve=>setTimeout(resolve,Math.min(10000,(status===429?2500:1000)*2**attempt)));return this.request(bookmaker,tournamentIds,attempt+1);
      }
      if(status===null)throw new Error('ODDSPAPI_NETWORK_ERROR: saved prices preserved; request counted');
      throw error;
    }
  }
  async accountPeriod(){return verifiedAccountPeriod((await this.request('',[],0,true)).data);}
  async snapshot(bookmaker:string,tournamentIds:readonly string[]):Promise<OddsSnapshot>{
    const response=await this.request(bookmaker,tournamentIds);
    return normalizeM5Snapshot(response.data,bookmaker,response.observedAt,tournamentIds);
  }
}
