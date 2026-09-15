import type {InterfaceLocale} from '@/localization/interface';
import {sportsCopy} from '@/sports/copy';
import {LIVE_ODDS_CAPABILITY,liveOddsUiState} from '@/odds/live-capability';

export function LiveOddsSlot({locale,live=true}:{locale:InterfaceLocale;live?:boolean}){
  const t=sportsCopy[locale];
  const state=liveOddsUiState({fixtureStatus:live?'LIVE':'SCHEDULED',capabilitySupported:LIVE_ODDS_CAPABILITY.supported});
  const showLiveCopy=live&&state!=='PREGAME';
  const label=showLiveCopy?t.liveOddsUnavailable:t.oddsUnavailable;
  return <div className={`odds-slot ${showLiveCopy?'odds-live-unavailable':'odds-not-pregame'}`} data-live-odds={state} data-live-capability={LIVE_ODDS_CAPABILITY.status}>
    <span className="odds-empty" title={label} aria-label={label}>{showLiveCopy?t.liveOddsUnavailable:'—'}</span>
  </div>;
}
