'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {CORE_GEOS,geoProfile,type CoreGeo} from '@/config/geo';

async function action(body:Record<string,unknown>){const response=await fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});if(!response.ok)throw Error(response.status===401?'Access key is invalid. Please check it and try again.':response.status===429?'Too many failed attempts. Please wait 15 minutes and try again.':response.status===503?'Owner sign-in is temporarily unavailable. Please try again shortly.':'Could not update preview. Please try again.');}

/** The jurisdiction a public route belongs to: `/mx`, `/co` or `/pe` and anything beneath them. */
export function geoForRoute(pathname:string):CoreGeo|null{
  const locale=/^\/(mx|co|pe)(?:\/|$)/.exec(pathname)?.[1];
  return CORE_GEOS.find(geo=>geoProfile(geo).locale===locale)??null;
}
/**
 * The commercial jurisdiction follows the signed preview cookie, while language follows the route. When
 * they disagree the page looks like one country but prices, currency and banners belong to another, so
 * this returns the route's GEO whenever it differs from an active preview.
 */
export function previewRouteMismatch(pathname:string,preview:boolean,previewGeo:CoreGeo|null|undefined):CoreGeo|null{
  const route=geoForRoute(pathname);
  return preview&&previewGeo&&route&&route!==previewGeo?route:null;
}
const describe=(geo:CoreGeo)=>{const p=geoProfile(geo);return `${p.countryName} · ${p.languageTag} · ${p.currency}`;};
const navigate=(geo:CoreGeo)=>{
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Signed GEO changes must replace private state retained by a shared cached root.
  window.location.assign(`/${geoProfile(geo).locale}`);
};

export function PreviewControls({authorized,preview,previewGeo,configured,country}:{authorized:boolean;preview:boolean;previewGeo?:CoreGeo|null;configured:boolean;country:string|null}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function run(body:Record<string,unknown>){setBusy(true);setError('');try{await action(body);window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}
  // Opening a country always previews that country, so these can never land on a route whose prices,
  // currency and banners belong to a different preview GEO.
  async function open(geo:CoreGeo){setBusy(true);setError('');try{await action({action:'preview',geo});navigate(geo);}catch(e){setError((e as Error).message);setBusy(false);}}
  function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,key=new FormData(form).get('key');form.reset();void run({action:'login',key});}
  return <main className="owner-preview-page"><h1>Owner GEO preview</h1><p>Trusted owner-only preview · no public country override</p>
    {!configured?<p>Owner access has not been configured.</p>:!authorized?<form onSubmit={login}><label htmlFor="owner-key">Private owner access key</label><input id="owner-key" name="key" type="password" autoComplete="current-password" required maxLength={128}/><button disabled={busy}>Sign in</button></form>:<>
      <p>Real connection: {country??'Unknown'} · <strong>{preview&&previewGeo?`${describe(previewGeo)} · QA_TEST`:'Real GEO'}</strong></p>
      <p>Preview traffic remains QA_TEST. Preview does not approve candidate operators or prove genuine local operator access.</p>
      <label>Experience <select disabled={busy} value={preview&&previewGeo?previewGeo:''} onChange={e=>void run({action:'preview',geo:e.target.value||null})}><option value="">Real GEO</option>{CORE_GEOS.map(geo=><option key={geo} value={geo}>{geoProfile(geo).countryName}</option>)}</select></label>
      {CORE_GEOS.map(geo=><button type="button" key={geo} disabled={busy} onClick={()=>void open(geo)}>Preview {geoProfile(geo).countryName} →</button>)}<a href="/owner/commercial">Commercial Activation</a><a href="/owner/growth">Growth</a><a href="/owner/health">Odds health</a><a href="/owner/analytics">Analytics</a><button disabled={busy} onClick={()=>void run({action:'logout'})}>Sign out</button><p>This device stays signed in for 30 days. Keep your permanent access key private.</p>
    </>}{error?<p role="alert">{error}</p>:null}</main>;
}

const syncKey=(from:CoreGeo,to:CoreGeo)=>`ls-owner-preview-sync:${from}->${to}`;
export function OwnerPreviewBar({preview,previewGeo}:{preview:boolean;previewGeo?:CoreGeo|null}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[mismatch,setMismatch]=useState<CoreGeo|null>(null);
  // A same-locale router refresh preserves the public root's private hydration
  // state. Reload the document after changing the signed cookie so the owner bar,
  // slip and offer controls all resolve the new jurisdiction together.
  async function change(geo:string){
    setBusy(true);
    try{await action({action:'preview',geo:geo||null});if(geo)navigate(geo as CoreGeo);else window.location.reload();}
    catch{setError('Open owner controls to sign in again.');setBusy(false);}
  }
  useEffect(()=>{setMismatch(previewRouteMismatch(window.location.pathname,preview,previewGeo));},[preview,previewGeo]);
  // The route the owner opened is the most recent intent, so the preview follows it. One attempt per
  // pair and session: if the cookie does not change, the loud warning below stays instead of a reload loop.
  useEffect(()=>{
    if(!previewGeo)return;
    if(!mismatch){try{for(const geo of CORE_GEOS)for(const to of CORE_GEOS)sessionStorage.removeItem(syncKey(geo,to));}catch{}return;}
    const key=syncKey(previewGeo,mismatch);let attempted=false;
    try{attempted=sessionStorage.getItem(key)==='1';sessionStorage.setItem(key,'1');}catch{attempted=true;}
    if(attempted)return;
    setBusy(true);
    action({action:'preview',geo:mismatch}).then(()=>window.location.reload()).catch(()=>{setError('Could not switch the preview automatically.');setBusy(false);});
  },[mismatch,previewGeo]);
  return <aside className="owner-preview-bar" aria-label="Owner preview" data-preview-geo={preview?previewGeo??'':'REAL'} data-route-mismatch={mismatch??undefined}>
    <strong>{preview?'QA_TEST · GEO preview':'Owner · Real GEO'}</strong>
    <label>GEO <select aria-label="Owner GEO" disabled={busy} value={preview?(previewGeo??''):''} onChange={e=>change(e.target.value)}><option value="">Real GEO</option>{CORE_GEOS.map(geo=><option key={geo} value={geo}>{geoProfile(geo).countryName}</option>)}</select></label>
    {preview&&previewGeo?<span className="owner-preview-context">{describe(previewGeo)}</span>:null}
    <a href="/owner/preview">Owner controls</a>
    {mismatch&&previewGeo?<p className="owner-preview-mismatch" role="alert">
      This page is {geoProfile(mismatch).countryName}, but the preview is {geoProfile(previewGeo).countryName}: odds, currency and banners follow {geoProfile(previewGeo).countryName}.
      {busy?' Switching the preview to match…':<> <button type="button" onClick={()=>{setBusy(true);action({action:'preview',geo:mismatch}).then(()=>window.location.reload()).catch(()=>{setError('Open owner controls to sign in again.');setBusy(false);});}}>Preview {geoProfile(mismatch).countryName} here</button> <button type="button" onClick={()=>navigate(previewGeo)}>Open /{geoProfile(previewGeo).locale}</button></>}
    </p>:null}
    {error?<span role="alert">{error}</span>:null}
  </aside>;
}
