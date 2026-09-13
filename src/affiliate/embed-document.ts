import 'server-only';
import {randomBytes} from 'node:crypto';
import type {Creative} from './types';
const html=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const js=(s:string)=>JSON.stringify(s).replaceAll('<','\\u003c');

export function embedDocument(c:Creative,parentOrigin:string,bridgeKey:string){
  const nonce=randomBytes(24).toString('base64');
  // Official Bannerflow image-mode compiles AdScript with eval/new Function.
  // unsafe-eval stays inside this credentialless, non-same-origin sandbox only.
  const policy=["default-src 'none'",`script-src 'nonce-${nonce}' 'unsafe-eval' https://c.bannerflow.net`,"connect-src https://c.bannerflow.net","img-src https://c.bannerflow.net data: blob:","font-src https://c.bannerflow.net data:","style-src 'unsafe-inline' https://c.bannerflow.net","frame-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'","frame-ancestors 'self'","sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox"].join('; ');
  // The approved src is emitted only in this short-lived, sandboxed publisher
  // document. No remote HTML is injected and no tracking parameter is rebuilt.
  const body=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Publicidade · Betsson</title><style>html,body{margin:0;padding:0;width:${c.width}px;height:${c.height}px;overflow:hidden;background:transparent}img:focus-visible{outline:3px solid #24d39b;outline-offset:-3px}</style></head><body><script nonce="${nonce}">
(()=>{const key=${js(bridgeKey)},origin=${js(parentOrigin)},label=${js(c.imageAlt)};let ready=false,activated=false;
 const send=kind=>parent.postMessage({type:'livasports:creative',key,kind},origin);
 const fail=()=>{if(!ready)send('failed');};
 const painted=()=>[...document.images].find(i=>i.complete&&i.naturalWidth>0)||[...document.querySelectorAll('canvas')].find(n=>n.width>0&&n.height>0)||null;
 const loaded=()=>{const media=painted();if(!media||ready)return;ready=true;if(media instanceof HTMLImageElement){media.alt=label;media.tabIndex=0;media.setAttribute('role','link');}send('ready')};
 const observer=new MutationObserver(loaded);observer.observe(document.body,{childList:true,subtree:true,attributes:true});document.addEventListener('load',loaded,true);
 const activation=e=>{if(!ready||activated||!e.isTrusted||document.visibilityState!=='visible')return;const image=e.target instanceof Element?e.target.closest('img'):null;if(!image)return;activated=true;send('click')};
 document.addEventListener('click',activation,true);document.addEventListener('auxclick',activation,true);
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target instanceof HTMLImageElement){activation(e);e.preventDefault();e.target.click()}},true);
 document.addEventListener('securitypolicyviolation',fail);
 window.addEventListener('error',e=>{if(e.target instanceof HTMLScriptElement)fail();},true);
 setTimeout(()=>{if(!ready)send('failed');observer.disconnect()},15000);
})();</script><script async src="${html(c.embedSourceUrl!)}"></script></body></html>`;
  return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), fullscreen=()'}});
}
