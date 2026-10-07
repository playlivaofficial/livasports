import 'server-only';
import {randomBytes} from 'node:crypto';
import {ONE_XBET_IFRAME_ORIGIN} from './embed-policy';
import type {Creative} from './types';
const html=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const js=(s:string)=>JSON.stringify(s).replaceAll('<','\\u003c');
const headers=(policy:string)=>({'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), fullscreen=()'});
const lang=(c:Creative)=>c.locale==='br'?'pt-BR':'es';
const label=(c:Creative)=>c.locale==='br'?'Publicidade':'Publicidad';

/**
 * The 1xBet Peru partner creative is already an iframe served by the operator, so it is nested inside
 * the same sandboxed publisher document rather than executed as a script. The only CSP relaxation is
 * `frame-src https://1xaff.pe`: there is no `unsafe-eval`, no script origin, no connect, img
 * or font origin, and every other restriction of the Betsson document is preserved or tightened.
 *
 * The nested frame is cross-origin, so its content cannot be inspected and a click inside it cannot be
 * observed. Readiness is therefore the frame's own load event, and this delivery emits no
 * `affiliate_embed_click`: the operator's iframe owns its click-through and reports it against the
 * server-side channel tag. Impressions are still measured in the parent page, which is first-party.
 */
function oneXBetDocument(c:Creative,parentOrigin:string,bridgeKey:string){
  const nonce=randomBytes(24).toString('base64');
  const policy=["default-src 'none'",`script-src 'nonce-${nonce}'`,`frame-src ${ONE_XBET_IFRAME_ORIGIN}`,"style-src 'unsafe-inline'","img-src 'none'","connect-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'","frame-ancestors 'self'","sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox"].join('; ');
  // Native size only. The approved creative is never stretched: the parent slot centres it and only
  // ever scales it down, so its aspect ratio is preserved at every breakpoint.
  const body=`<!doctype html><html lang="${lang(c)}"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${label(c)} · 1xBet</title><style>html,body{margin:0;padding:0;width:${c.width}px;height:${c.height}px;overflow:hidden;background:transparent}iframe{display:block;width:${c.width}px;height:${c.height}px;border:0;background:transparent}</style></head><body><iframe id="creative" title="${html(c.imageAlt)}" width="${c.width}" height="${c.height}" scrolling="no" frameborder="0" referrerpolicy="no-referrer" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="${html(c.embedSourceUrl!)}"></iframe><script nonce="${nonce}">
(()=>{const key=${js(bridgeKey)},origin=${js(parentOrigin)},frame=document.getElementById('creative');let ready=false;
 const send=kind=>parent.postMessage({type:'livasports:creative',key,kind},origin);
 const fail=()=>{if(!ready)send('failed');};
 // A cross-origin frame reports only that it loaded. Nothing inside it is read, and no click is
 // synthesised: the operator creative navigates itself into a new context.
 frame.addEventListener('load',()=>{if(ready)return;ready=true;send('ready')});
 frame.addEventListener('error',fail);
 document.addEventListener('securitypolicyviolation',fail);
 setTimeout(fail,15000);
})();</script></body></html>`;
  return new Response(body,{headers:headers(policy)});
}

export function embedDocument(c:Creative,parentOrigin:string,bridgeKey:string){
  if(c.delivery==='ONE_XBET_IFRAME')return oneXBetDocument(c,parentOrigin,bridgeKey);
  const nonce=randomBytes(24).toString('base64');
  // Official Bannerflow image-mode compiles AdScript with eval/new Function.
  // unsafe-eval stays inside this credentialless, non-same-origin sandbox only.
  const policy=["default-src 'none'",`script-src 'nonce-${nonce}' 'unsafe-eval' https://c.bannerflow.net`,"connect-src https://c.bannerflow.net","img-src https://c.bannerflow.net data: blob:","font-src https://c.bannerflow.net data:","style-src 'unsafe-inline' https://c.bannerflow.net","frame-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'","frame-ancestors 'self'","sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox"].join('; ');
  // The approved src is emitted only in this short-lived, sandboxed publisher
  // document. No remote HTML is injected and no tracking parameter is rebuilt.
  const body=`<!doctype html><html lang="${lang(c)}"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${label(c)} · Betsson</title><style>html,body{margin:0;padding:0;width:${c.width}px;height:${c.height}px;overflow:hidden;background:transparent}img:focus-visible{outline:3px solid #24d39b;outline-offset:-3px}</style></head><body><script nonce="${nonce}">
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
  return new Response(body,{headers:headers(policy)});
}
