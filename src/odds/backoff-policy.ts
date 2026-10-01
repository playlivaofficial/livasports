export type BackoffFailureClass='HARD_TARGET'|'TRANSIENT_PROVIDER'|'RATE_LIMIT'|'AUTH'|'TRANSPORT'|'DATA_EMPTY'|'MAPPING'|'MARKET'|'NO_CHANGE'|'TARGET_COOLDOWN'|'COMPETITION_COOLDOWN'|'BOOKMAKER_COOLDOWN'|'UNKNOWN';
export type BackoffSubreason=
  'HTTP_404_TARGET_NOT_FOUND'|'HTTP_429_RATE_LIMIT'|'HTTP_5XX_TRANSIENT'|'AUTH_REJECTED'|'EMPTY_NO_UPCOMING_FIXTURES'|
  'EMPTY_TEMPORARY_RESPONSE'|'BOOKMAKER_MARKETS_ABSENT'|'FIXTURE_MAPPING_FAILURE'|'MARKET_MISSING'|'REPEATED_NO_CHANGE'|
  'TRANSPORT_FAILURE'|'TARGET_SPECIFIC_COOLDOWN'|'COMPETITION_LEVEL_COOLDOWN'|'BOOKMAKER_LEVEL_COOLDOWN'|
  'INHERITED_HISTORICAL_BACKOFF'|'CIRCUIT_BREAKER'|'UNKNOWN_BACKOFF';

export interface BackoffEvidence {code:string|null;httpStatus:number|null;neverSucceeded:boolean;isolated:boolean;catalogEmpty:boolean;fixtures:number;}
export interface BackoffDecision {failureClass:BackoffFailureClass;subreason:BackoffSubreason;delayMinutes:number;hard:boolean;evidence:BackoffEvidence;}

export function classifyBackoff(input:{code:string|null;neverSucceeded?:boolean;isolated?:boolean;catalogEmpty?:boolean;fixtures?:number;consecutiveFailures?:number}):BackoffDecision{
  const code=input.code??'UNKNOWN';
  const http=Number(code.match(/HTTP_(\d{3})/)?.[1]??NaN);const failures=Math.max(1,input.consecutiveFailures??1);
  const evidence:BackoffEvidence={code:input.code,httpStatus:Number.isFinite(http)?http:null,neverSucceeded:!!input.neverSucceeded,isolated:!!input.isolated,catalogEmpty:!!input.catalogEmpty,fixtures:Math.max(0,input.fixtures??0)};
  if(http===404)return input.neverSucceeded?
    {failureClass:'HARD_TARGET',subreason:'HTTP_404_TARGET_NOT_FOUND',delayMinutes:720,hard:true,evidence}:
    {failureClass:'DATA_EMPTY',subreason:'EMPTY_TEMPORARY_RESPONSE',delayMinutes:30,hard:false,evidence};
  if(http===429)return {failureClass:'RATE_LIMIT',subreason:'HTTP_429_RATE_LIMIT',delayMinutes:Math.min(120,15*2**Math.min(3,failures-1)),hard:true,evidence};
  if(http===401||http===403)return {failureClass:'AUTH',subreason:'AUTH_REJECTED',delayMinutes:360,hard:true,evidence};
  if(http>=500&&http<600)return {failureClass:'TRANSIENT_PROVIDER',subreason:'HTTP_5XX_TRANSIENT',delayMinutes:Math.min(60,5*2**Math.min(4,failures-1)),hard:false,evidence};
  if(code.includes('NETWORK')||code.includes('TRANSPORT')||code.includes('TIMEOUT'))return {failureClass:'TRANSPORT',subreason:'TRANSPORT_FAILURE',delayMinutes:Math.min(60,5*2**Math.min(4,failures-1)),hard:false,evidence};
  if(code==='ODDS_UPSTREAM_COOLDOWN')return {failureClass:'BOOKMAKER_COOLDOWN',subreason:'CIRCUIT_BREAKER',delayMinutes:30,hard:true,evidence};
  if(code.includes('MAPPING')||code==='ODDS_IDENTITY_CONFLICT')return {failureClass:'MAPPING',subreason:'FIXTURE_MAPPING_FAILURE',delayMinutes:0,hard:true,evidence};
  if(code.includes('MARKET'))return {failureClass:'MARKET',subreason:'MARKET_MISSING',delayMinutes:0,hard:true,evidence};
  if(code.includes('NO_CHANGE'))return {failureClass:'NO_CHANGE',subreason:'REPEATED_NO_CHANGE',delayMinutes:30,hard:false,evidence};
  if(code.includes('EMPTY'))return input.catalogEmpty||input.fixtures===0?
    {failureClass:'DATA_EMPTY',subreason:'EMPTY_NO_UPCOMING_FIXTURES',delayMinutes:720,hard:true,evidence}:
    {failureClass:'DATA_EMPTY',subreason:'EMPTY_TEMPORARY_RESPONSE',delayMinutes:30,hard:false,evidence};
  return {failureClass:'UNKNOWN',subreason:'UNKNOWN_BACKOFF',delayMinutes:15,hard:false,evidence};
}

/** Stable, target-local jitter prevents all recovered feeds re-entering the queue together. */
export function backoffJitterMinutes(bookmaker:string,tournamentId:string){
  let hash=0;for(const ch of `${bookmaker}:${tournamentId}`)hash=(hash*31+ch.charCodeAt(0))>>>0;return hash%5;
}

/** Old transient state may be reconsidered; hard target/auth/quota failures never are. */
export function effectiveBackoffAt(input:{retryAfter:string|null;lastAttemptAt?:string|null;failureClass?:string|null;subreason?:string|null;
  recentNative?:boolean;nativePriority?:number;nearKickoff?:boolean;closeToExpiry?:boolean;bookmaker:string;tournamentId:string}){
  const retry=Date.parse(input.retryAfter??'');if(!Number.isFinite(retry))return 0;
  const transient=['TRANSIENT_PROVIDER','TRANSPORT','NO_CHANGE'].includes(input.failureClass??'');
  if(!transient)return retry;
  const attempt=Date.parse(input.lastAttemptAt??'');if(!Number.isFinite(attempt))return retry;
  const coverageAware=input.closeToExpiry||input.nearKickoff||input.recentNative||Number(input.nativePriority)>0;
  if(!coverageAware)return retry;
  const minutes=input.closeToExpiry||input.nearKickoff?15:input.nativePriority?30:45;
  return Math.min(retry,attempt+(minutes+backoffJitterMinutes(input.bookmaker,input.tournamentId))*60000);
}
