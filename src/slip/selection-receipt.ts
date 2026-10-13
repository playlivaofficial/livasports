import {createHmac,timingSafeEqual} from 'node:crypto';
import type {BoundSelection} from './types';
import {selectionKey} from './types';
import type {SelectionLock} from './selection-lock';
import {comparisonPair,minusTenPercent} from '@/odds/calculated-estimate';
import {primaryVisibleBookmakers} from '@/odds/fallback-pool';
import {isCoreGeo} from '@/config/geo';

// Domain-separated from affiliate offers and owner authentication; never import into a client component.
export function selectionSigningKey(){const key=process.env.AFFILIATE_SIGNING_SECRET;return key&&key.length>=43?key:null;}
function mac(value:string,key:string){return createHmac('sha256',key).update('livasports:strict-selection:v1:'+value).digest('base64url');}
// Compact new receipts keep ten-leg affiliate URLs bounded. Existing signed object receipts remain valid.
export function signSelection(lock:SelectionLock,key:string){const value=Buffer.from(JSON.stringify([lock.v,lock.key,lock.geo,lock.book,lock.quote,lock.provider,lock.price,lock.observed,lock.expires,...(lock.v===2?[lock.priceKind,lock.sourceBook,lock.sourcePrice]:[])])).toString('base64url');return value+'.'+mac(value,key);}
export function verifySelection(selection:BoundSelection,geo:string|null,key=selectionSigningKey()):SelectionLock|null {
  const receipt=(selection as BoundSelection).receipt;
  if(!key||!geo||typeof receipt!=='string'||receipt.length>1600||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(receipt))return null;
  const [value,signature]=receipt.split('.');if(!timingSafeEqual(Buffer.from(signature),Buffer.from(mac(value,key))))return null;
  try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(Array.isArray(parsed)&&!((parsed[0]===1&&parsed.length===9)||(parsed[0]===2&&parsed.length===12)))return null;
    const lock:SelectionLock=Array.isArray(parsed)?{v:parsed[0],key:parsed[1],geo:parsed[2],book:parsed[3],quote:parsed[4],provider:parsed[5],price:parsed[6],observed:parsed[7],expires:parsed[8],...(parsed[0]===2?{priceKind:parsed[9],sourceBook:parsed[10],sourcePrice:parsed[11]}:{})}:parsed;
    if(![1,2].includes(lock.v)||lock.key!==selectionKey(selection)||lock.geo!==geo||!Number.isFinite(lock.expires)||!Number.isFinite(Date.parse(lock.observed))||
      ![lock.book,lock.quote,lock.provider,lock.price].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)||!Number.isFinite(Number(lock.price))||Number(lock.price)<=(lock.v===2?0:1)||Number(lock.price)>1000)return null;
    if(lock.v===2&&(lock.priceKind!=='CALCULATED_MINUS_10'||!lock.sourceBook||!lock.sourcePrice||
      !isCoreGeo(geo)||!primaryVisibleBookmakers(geo).includes(lock.book)||!comparisonPair([lock.book,lock.sourceBook])||minusTenPercent(lock.sourcePrice)!==lock.price))return null;
    return lock;
  }catch{return null;}
}
