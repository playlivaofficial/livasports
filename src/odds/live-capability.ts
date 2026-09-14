/**
 * Current OddsPapi account verification requires has_live_odds=false for both
 * paid bookmakers. Official GET /v4/bookmakers exposes liveOdds per slug.
 * Live prices would need GET /v4/odds?fixtureId= for statusId=1 fixtures, which
 * is outside the verified pregame odds-by-tournaments gateway and budget.
 */
export const LIVE_ODDS_CAPABILITY={
  supported:false,
  status:'PLAN-BLOCKED',
  reason:'ACCOUNT_HAS_LIVE_ODDS_FALSE',
  provider:'ODDSPAPI',
  endpointRequired:'GET /v4/odds?fixtureId={id} for live fixtures (statusId=1), after GET /v4/bookmakers reports liveOdds=true for betano.bet.br and betsson',
  requestImpact:'Each live fixture refresh is a separate billable OddsPapi request; a live cadence cannot reuse the pregame tournament batch without live entitlement',
} as const;

export type LiveOddsUiState='PREGAME'|'LIVE'|'SUSPENDED'|'WITHDRAWN'|'STALE'|'UNAVAILABLE';

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
