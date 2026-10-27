import {automationSources,type EventFacts,eventKey,fingerprint,stableFacts} from './policy';

/** Non-secret, explicit Owner authorization scope; absent means existing normal operation. */
export interface CanaryScope {id:string;sourceId:string;eventKey:string;fingerprint:string;notBefore:string;expiresAt:string;priorReservedMicroUsd:number}
export function parseCanary(raw:string|undefined):CanaryScope|undefined{
 if(raw===undefined)return undefined;
 try{
  const c=JSON.parse(raw);
  if(!c||Object.keys(c).sort().join(',')!=='eventKey,expiresAt,fingerprint,id,notBefore,priorReservedMicroUsd,sourceId'||
   !/^[a-z0-9-]{8,80}$/.test(c.id)||!automationSources.some(s=>s.id===c.sourceId&&s.automaticAccess&&s.permission!=='metadata-review')||
   typeof c.eventKey!=='string'||c.eventKey.length>240||!/^(citation:|bundesliga:)/.test(c.eventKey)||
   !/^[a-f0-9]{64}$/.test(c.fingerprint)||typeof c.expiresAt!=='string'||!Number.isFinite(Date.parse(c.expiresAt))||
   typeof c.notBefore!=='string'||!Number.isFinite(Date.parse(c.notBefore))||Date.parse(c.expiresAt)<=Date.parse(c.notBefore)||Date.parse(c.expiresAt)-Date.parse(c.notBefore)>3600000||
   !Number.isSafeInteger(c.priorReservedMicroUsd)||c.priorReservedMicroUsd<0||c.priorReservedMicroUsd>1000000)throw Error();
  return c;
 }catch{throw Error('INVALID_CANARY_SCOPE');}
}
export function canaryMatches(scope:CanaryScope,facts:EventFacts){
 return facts.kind!=='metadata'&&facts.sourceId===scope.sourceId&&eventKey(facts)===scope.eventKey&&fingerprint(stableFacts(facts))===scope.fingerprint;
}
