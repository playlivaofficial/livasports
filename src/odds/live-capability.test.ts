import {describe,expect,it} from 'vitest';
import {LIVE_ODDS_CAPABILITY,liveOddsUiState} from './live-capability';
import {verifiedAccountPeriod} from './budget';

describe('live odds capability gate',()=>{
  const account={subscriptions:[{is_active:true,valid_from:'2026-09-02T11:10:51Z',valid_until:'2026-10-02T11:10:51Z',request_limit:5000,request_count:65,
    sport_ids:[10,11],bookmakers:{'betano.bet.br':{has_live_odds:false,has_player_props:false},betsson:{has_live_odds:false,has_player_props:false}}}]};

  it('proves the current verified account cannot ingest live odds',()=>{
    expect(LIVE_ODDS_CAPABILITY.supported).toBe(false);
    expect(LIVE_ODDS_CAPABILITY.status).toBe('PLAN-BLOCKED');
    expect(verifiedAccountPeriod(account,new Date('2026-09-15'))).toMatchObject({used:65});
    expect(()=>verifiedAccountPeriod({subscriptions:[{...account.subscriptions[0],bookmakers:{'betano.bet.br':{has_live_odds:true,has_player_props:false},betsson:{has_live_odds:false,has_player_props:false}}}]},new Date('2026-09-15'))).toThrow('UNVERIFIED');
  });
  it('never relabels a pregame quote as live',()=>{
    expect(liveOddsUiState({fixtureStatus:'LIVE'})).toBe('UNAVAILABLE');
    expect(liveOddsUiState({fixtureStatus:'LIVE',capabilitySupported:true,quotePhase:'PREGAME',quoteStatus:'ACTIVE',fresh:true})).toBe('UNAVAILABLE');
    expect(liveOddsUiState({fixtureStatus:'LIVE',capabilitySupported:true,quotePhase:'LIVE',quoteStatus:'ACTIVE',fresh:true})).toBe('LIVE');
    expect(liveOddsUiState({fixtureStatus:'LIVE',capabilitySupported:true,quotePhase:'LIVE',quoteStatus:'SUSPENDED',fresh:true})).toBe('SUSPENDED');
    expect(liveOddsUiState({fixtureStatus:'LIVE',capabilitySupported:true,quotePhase:'LIVE',quoteStatus:'ACTIVE',fresh:false})).toBe('STALE');
    expect(liveOddsUiState({fixtureStatus:'SCHEDULED',quotePhase:'PREGAME',quoteStatus:'ACTIVE',fresh:true})).toBe('PREGAME');
  });
});
