import type {MatchCenterView} from '@/match-center/types';
import type {InterfaceLocale} from '@/localization/interface';
import {ctrMatchMetadata} from './ctr-variants';

/** Short, factual intent bridge on selected pages only; existing module anchors and data remain intact. */
export function MatchQueryIntro({locale,match}:{locale:InterfaceLocale;match:MatchCenterView}){
  const variant=ctrMatchMetadata(locale,match);if(!variant)return null;
  return <p className="match-query-intro">{variant.intro} <a href={variant.anchor}>{variant.label} →</a></p>;
}
