import type {SiteLocale} from '@/config/i18n';
import type {OddsMarket} from '@/odds/types';
import type {SlipUiLocale} from '@/slip/localization';
/** Compatibility export only. Unpriced selection is permanently disabled. */
export function UnpricedSelections(_props:{fixturePublicId?:string;kickoff?:string|null;market?:OddsMarket;locale?:SiteLocale|null;uiLocale:SlipUiLocale}){
 void _props;
 return null;
}
