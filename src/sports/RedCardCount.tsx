import {isSpanishLocale} from '@/config/geo';
import type {InterfaceLocale} from '@/localization/interface';

export function RedCardCount({count,locale}:{count:number|null|undefined;locale:InterfaceLocale}){
  if(!Number.isInteger(count)||!count||count<0)return null;
  const label=locale==='br'?'Cartões vermelhos':isSpanishLocale(locale)?'Tarjetas rojas':'Red cards';
  return <span className="sports-red-cards" aria-label={`${label}: ${count}`} title={`${label}: ${count}`}>{count}</span>;
}
