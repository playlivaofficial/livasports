/**
 * Current OddsPapi account verification requires has_live_odds=false for both
 * paid bookmakers. Official GET /v4/odds?fixtureId= returns current prices
 * (pregame or in-play) with a 500ms endpoint cooldown. Live prices are only
 * usable after GET /v4/bookmakers reports liveOdds=true for betano.bet.br and
 * betsson. That entitlement is outside the verified pregame odds-by-tournaments
 * gateway and 5,000-request period budget. Do not purchase a plan from code.
 */
export const LIVE_ODDS_CAPABILITY={
  supported:false,
  status:'PLAN-BLOCKED',
  reason:'ACCOUNT_HAS_LIVE_ODDS_FALSE',
  provider:'ODDSPAPI',
  endpointRequired:'GET /v4/odds?fixtureId={id} (optional bookmakers=betano.bet.br,betsson); 500ms cooldown',
  requiredProviderCapability:'liveOdds=true on betano.bet.br and betsson in GET /v4/bookmakers / account.bookmakers',
  estimatedPlanImpact:'Public OddsPapi docs do not list a separate live-odds SKU price. Enabling live would add one billable GET /v4/odds per live fixture refresh and cannot reuse the pregame tournament batch.',
  requestImpact:'Each live fixture refresh is a separate billable OddsPapi request; a live cadence cannot reuse the pregame tournament batch without live entitlement',
  engineeringAfterEntitlement:[
    'Widen odds_current.phase CHECK to include LIVE',
    'Add a server-only GET /v4/odds gateway method',
    'Refresh only currently LIVE fixtures on a budget-aware cadence',
    'Persist LIVE quotes separately from PREGAME',
    'Selectable live odds + slip LIVE label with honest suspension/repricing',
    'Re-verify account scope if has_live_odds becomes the documented entitlement',
  ],
} as const;

export type LiveOddsUiState='PREGAME'|'LIVE'|'SUSPENDED'|'WITHDRAWN'|'STALE'|'UNAVAILABLE';
export const LIVE_QUOTE_STATES=['LIVE_CURRENT','LIVE_SUSPENDED','LIVE_STALE','LIVE_WITHDRAWN','LIVE_UNAVAILABLE'] as const;
export type LiveQuoteState=typeof LIVE_QUOTE_STATES[number];

export function liveOddsEntitlementFromBookmakers(bookmakers:Record<string,{has_live_odds?:boolean}>|null|undefined){
  const betanoLive=bookmakers?.['betano.bet.br']?.has_live_odds===true;
  const betssonLive=bookmakers?.betsson?.has_live_odds===true;
  if(betanoLive&&betssonLive)return {supported:true as const,status:'SUPPORTED' as const,reason:'ACCOUNT_HAS_LIVE_ODDS_TRUE',betanoLive,betssonLive};
  return {supported:false as const,status:'PLAN-BLOCKED' as const,reason:'ACCOUNT_HAS_LIVE_ODDS_FALSE',betanoLive,betssonLive};
}

export function liveOddsUiState(input:{fixtureStatus:string;capabilitySupported?:boolean;quotePhase?:string|null;quoteStatus?:string|null;fresh?:boolean}):LiveOddsUiState {
  const live=input.fixtureStatus==='LIVE'||input.fixtureStatus==='HALFTIME';
  if(!live)return 'PREGAME';
  if(!(input.capabilitySupported??LIVE_ODDS_CAPABILITY.supported))return 'UNAVAILABLE';
  if(input.quotePhase&&input.quotePhase!=='LIVE')return 'UNAVAILABLE';
  if(input.quoteStatus==='SUSPENDED')return 'SUSPENDED';
  if(input.quoteStatus==='WITHDRAWN'||input.quoteStatus==='CLOSED')return 'WITHDRAWN';
  if(input.fresh===false)return 'STALE';
  if(input.quotePhase==='LIVE'&&input.quoteStatus==='ACTIVE')return 'LIVE';
  return 'UNAVAILABLE';
}

export function classifyLiveQuote(input:{fixtureStatus:string;capabilitySupported?:boolean;quotePhase?:string|null;quoteStatus?:string|null;fresh?:boolean}):LiveQuoteState {
  const state=liveOddsUiState(input);
  if(state==='LIVE')return 'LIVE_CURRENT';
  if(state==='SUSPENDED')return 'LIVE_SUSPENDED';
  if(state==='STALE')return 'LIVE_STALE';
  if(state==='WITHDRAWN')return 'LIVE_WITHDRAWN';
  return 'LIVE_UNAVAILABLE';
}

/** Server-side only. Never refresh when entitlement is blocked or the match is not live. */
export function liveRefreshDecision(input:{capabilitySupported?:boolean;fixtureStatus:string;now:number;lastRefreshAt?:number|null;intervalMs?:number}){
  if(!(input.capabilitySupported??LIVE_ODDS_CAPABILITY.supported))return {refresh:false,reason:'PLAN-BLOCKED'};
  if(input.fixtureStatus==='FINISHED')return {refresh:false,reason:'FINISHED'};
  if(input.fixtureStatus==='HALFTIME')return {refresh:false,reason:'SUSPENDED_INTERVAL'};
  if(input.fixtureStatus!=='LIVE')return {refresh:false,reason:'NOT_LIVE'};
  const interval=input.intervalMs??3*60*1000;
  if(input.lastRefreshAt!=null&&input.now-input.lastRefreshAt<interval)return {refresh:false,reason:'CADENCE'};
  return {refresh:true,reason:'LIVE_ACTIVE'};
}
