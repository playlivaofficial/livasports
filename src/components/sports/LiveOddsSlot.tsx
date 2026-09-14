import type {InterfaceLocale} from '@/localization/interface';
import {sportsCopy} from '@/sports/copy';

export function LiveOddsSlot({locale,live=true}:{locale:InterfaceLocale;live?:boolean}){
  const t=sportsCopy[locale];
  const label=live?t.liveOddsUnavailable:t.oddsUnavailable;
  return <div className={`odds-slot ${live?'odds-live-unavailable':'odds-not-pregame'}`}><span className="odds-empty" title={label} aria-label={label}>{live?t.liveOddsUnavailable:'—'}</span></div>;
}
