import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {isSponsorPlacement,parseContext} from './policy';
import {uuid,type OfferToken} from './types';
export function signingKey(){const key=process.env.AFFILIATE_SIGNING_SECRET;return key&&key.length>=43?key:null;}
function mac(value:string,key:string){return createHmac('sha256',key).update('livasports:m8:offer:'+value).digest('base64url');}
export function signOffer(payload:OfferToken,key:string):string{const value=Buffer.from(JSON.stringify(payload)).toString('base64url');return value+'.'+mac(value,key);}
export function verifyOffer(token:unknown,key:string,now=Date.now(),allowExpired=false):OfferToken|null{
  if(typeof token!=='string'||token.length>6000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return null;
  const [value,signature]=token.split('.');if(!timingSafeEqual(Buffer.from(signature),Buffer.from(mac(value,key))))return null;
  try{const p=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(p.v!==1||!uuid.test(p.viewId)||!uuid.test(p.campaignId)||!Number.isFinite(p.expiresAt)||!allowExpired&&p.expiresAt<=now||p.expiresAt>now+300000||!parseContext(p.context)||Object.keys(p).some(k=>!['v','viewId','campaignId','context','expiresAt','embedPermission'].includes(k))||Object.keys(p).length!==(p.embedPermission===undefined?5:6)||p.embedPermission!==undefined&&(!['anonymous','consent'].includes(p.embedPermission)||!isSponsorPlacement(p.context.placement)))return null;
    return p;
  }catch{return null;}
}
export function clickDedup(viewId:string,now:number,key:string){return createHmac('sha256',key).update(`livasports:m8:click:${viewId}:${Math.floor(now/10000)}`).digest('hex');}
