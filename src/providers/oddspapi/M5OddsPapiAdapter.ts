import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@/database/client';
import type { OddsProvider, OddsSnapshot } from '@/odds/types';
import { inspectM5OfferFlags, M5_TOURNAMENTS, normalizeM5Snapshot } from './m5-normalizer';
import type { CatalogTournament } from './tournament-catalog';
import { MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST } from './request-limits';
import {reserveOddsRequest,verifiedAccountPeriod} from '@/odds/budget';
import {bookmakerConfig} from '@/odds/registry';

type RequestKind='odds'|'account'|'tournaments';
export class M5OddsPapiAdapter implements OddsProvider {
  private used=0;
  constructor(private readonly database:DatabaseClient,private readonly key:string,private readonly jobId:string,private readonly runCap=4,
    private readonly routine=false,private readonly deadline=Date.now()+140000,
    private catalogTournaments:readonly CatalogTournament[]=M5_TOURNAMENTS.map(row=>({id:row.id,slug:row.slug,category:row.category,canonical:row.canonical})),
    private readonly maxRetries:0|1=1){
    if(!key||!Number.isInteger(runCap)||runCap<1||runCap>6)throw new Error('INVALID_ODDS_WORKER_CONFIG');
  }
  requestCount(){return this.used;}
  setCatalog(tournaments:readonly CatalogTournament[]){this.catalogTournaments=tournaments;}
  allowedTournamentIds(){return new Set(this.catalogTournaments.map(row=>row.id));}
  private async request(bookmaker:string,tournamentIds:readonly string[],attempt=0,kind:RequestKind='odds'):Promise<{data:unknown;observedAt:string}> {
    const endpoint=kind==='account'?'/v4/account':kind==='tournaments'?'/v4/tournaments':'/v4/odds-by-tournaments';
    const query:Record<string,string>=kind==='account'?{}:kind==='tournaments'?{sportId:'10',language:'en'}
      :{bookmaker,tournamentIds:tournamentIds.join(','),language:'en',verbosity:'3',oddsFormat:'decimal'};
    const allowed=this.allowedTournamentIds();
    if(kind==='odds'&&(!bookmakerConfig(bookmaker)||!tournamentIds.length||tournamentIds.some(id=>!allowed.has(id))))throw new Error('OUT_OF_SCOPE_ODDS_REQUEST');
    if(kind==='odds'&&tournamentIds.length>MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST)throw new Error('ODDS_TOURNAMENT_BATCH_LIMIT');
    if(this.used>=this.runCap)throw new Error('ODDS_RUN_CAP_REACHED');
    if(Date.now()+35000>this.deadline)throw new Error('ODDS_RUN_DEADLINE');
    const latest=await this.database.query('SELECT max(started_at) AS at FROM odds_provider_requests');
    const wait=latest.rows[0].at?Math.max(0,2500-(Date.now()-latest.rows[0].at.getTime())):0;
    if(wait)await new Promise(resolve=>setTimeout(resolve,Math.min(wait,2500)));
    const id=randomUUID();
    await this.database.transaction(tx=>reserveOddsRequest(tx,{id,jobId:this.jobId,endpoint,query,routine:this.routine,unmetered:kind==='account'}));
    this.used++;
    const url=new URL(`https://api.oddspapi.io${endpoint}`);Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,v));url.searchParams.set('apiKey',this.key);
    let status:number|null=null;
    try {
      const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});status=response.status;
      const rawBody=await response.text();
      const body:unknown=(()=>{try{return JSON.parse(rawBody);}catch{return {message:rawBody};}})();const observedAt=new Date().toISOString();
      await this.database.query('UPDATE odds_provider_requests SET http_status=$2,completed_at=$3,outcome=$4 WHERE id=$1',[id,status,observedAt,response.ok?'SUCCEEDED':'HTTP_ERROR']);
      if(!response.ok){
        const safe=JSON.stringify(body, (key,value)=>/api.?key|token|secret|authorization|email/i.test(key)?'[REDACTED]':value).split(this.key).join('[REDACTED]');
        throw new Error(JSON.stringify({status,endpoint,query,body:JSON.parse(safe)}));
      }
      return {data:body,observedAt};
    }catch(error){
      if(status===null)await this.database.query("UPDATE odds_provider_requests SET completed_at=now(),outcome='NETWORK_ERROR' WHERE id=$1",[id]);
      if(kind==='odds'&&(status===429||status===null||(status>=500&&status<600))&&this.used<this.runCap&&attempt<this.maxRetries&&Date.now()+45000<this.deadline){
        await new Promise(resolve=>setTimeout(resolve,Math.min(10000,(status===429?2500:1000)*2**attempt)));return this.request(bookmaker,tournamentIds,attempt+1,kind);
      }
      if(status===null)throw new Error('ODDSPAPI_NETWORK_ERROR: saved prices preserved; request counted');
      throw error;
    }
  }
  async accountPeriod(){return verifiedAccountPeriod((await this.request('',[],0,'account')).data);}
  async providerTournaments(){return (await this.request('',[],0,'tournaments')).data;}
  async snapshot(bookmaker:string,tournamentIds:readonly string[]):Promise<OddsSnapshot>{
    const response=await this.request(bookmaker,tournamentIds);
    return normalizeM5Snapshot(response.data,bookmaker,response.observedAt,tournamentIds,this.catalogTournaments);
  }
  async inspectOfferFlags(bookmaker:string,tournamentIds:readonly string[]){
    const response=await this.request(bookmaker,tournamentIds);
    return {observedAt:response.observedAt,flags:inspectM5OfferFlags(response.data,bookmaker),
      snapshot:normalizeM5Snapshot(response.data,bookmaker,response.observedAt,tournamentIds,this.catalogTournaments)};
  }
}
