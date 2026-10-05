import 'server-only';
import {randomBytes} from 'node:crypto';
import type {Creative} from '@/affiliate/types';
import {safeBetssonEmbed} from '@/affiliate/embed-policy';

const cache=new Map<string,{until:number;image:Promise<string>}>();
async function boundedBytes(response:Response,max:number){
  if(!response.ok||Number(response.headers.get('content-length')??0)>max)throw Error('QA_CREATIVE_UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)throw Error('QA_CREATIVE_UNAVAILABLE');const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw Error('QA_CREATIVE_UNAVAILABLE');}chunks.push(value);}return Buffer.concat(chunks);}finally{reader.releaseLock();}
}
/** Read declarative image-mode metadata. Never evaluate the publisher script or
 * load its tracking/custom scripts, destination, cookies, or conversion pixels. */
export function approvedImagePath(source:string,width:number,height:number):string|null{
  const encoded=source.match(/JSON\.parse\(\(\w+="([A-Za-z0-9+/=]+)"/);if(!encoded)return null;
  try{const data=JSON.parse(Buffer.from(encoded[1],'base64').toString('utf8'));if(data.creatives?.length!==1)return null;const c=data.creatives[0];
    return c.size?.width===width&&c.size?.height===height&&typeof c.image?.url==='string'&&/^accounts\/betsson\/[a-f0-9]{24}\/published\/\d+\/[a-f0-9]+\/preload\.(jpg|png|webp)$/.test(c.image.url)?c.image.url:null;
  }catch{return null;}
}
async function loadImage(c:Creative,campaignId:string,operator:string){
  const source=safeBetssonEmbed(c.embedSourceUrl,campaignId,operator,c.locale);if(!source)throw Error('QA_CREATIVE_UNAVAILABLE');
  const script=await boundedBytes(await fetch(source,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)}),256000);
  const path=approvedImagePath(script.toString('utf8'),c.width,c.height);if(!path)throw Error('QA_CREATIVE_UNAVAILABLE');
  const image=await fetch(new URL(path,'https://c.bannerflow.net/'),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  const mime=image.headers.get('content-type')?.split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(mime??''))throw Error('QA_CREATIVE_UNAVAILABLE');
  const bytes=await boundedBytes(image,1024000);return `data:${mime};base64,${bytes.toString('base64')}`;
}
export async function qaCreativeDocument(c:Creative,campaignId:string,parentOrigin:string,bridgeKey:string,operator:string){
  const key=operator+':'+c.locale+':'+c.embedSourceUrl+':'+c.width+':'+c.height;let item=cache.get(key);
  if(!item||item.until<Date.now()){if(cache.size>=32)cache.clear();item={until:Date.now()+300000,image:loadImage(c,campaignId,operator)};cache.set(key,item);item.image.catch(()=>cache.delete(key));}
  const image=await item.image,nonce=randomBytes(24).toString('base64');
  const js=(s:string)=>JSON.stringify(s).replaceAll('<','\\u003c');
  const body=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Publicidade · QA_TEST</title><style>html,body{margin:0;width:${c.width}px;height:${c.height}px;overflow:hidden}img{display:block;cursor:pointer}img:focus-visible{outline:3px solid #24d39b;outline-offset:-3px}</style></head><body><img width="${c.width}" height="${c.height}" src="${image}" tabindex="0" role="link"><script nonce="${nonce}">(()=>{const img=document.querySelector('img');img.alt=${js(c.imageAlt)};const send=kind=>parent.postMessage({type:'livasports:creative',key:${js(bridgeKey)},kind},${js(parentOrigin)});img.addEventListener('load',()=>send('ready'));img.addEventListener('error',()=>send('failed'));if(img.complete&&img.naturalWidth)send('ready');let clicked=false;const activate=e=>{if(!e.isTrusted||clicked||document.visibilityState!=='visible')return;clicked=true;send('click')};img.addEventListener('click',activate);img.addEventListener('auxclick',activate);img.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();activate(e)}})})();</script></body></html>`;
  return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; img-src data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts`}});
}
