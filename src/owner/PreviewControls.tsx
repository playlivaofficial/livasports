'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {CORE_GEOS,geoProfile,type CoreGeo} from '@/config/geo';

async function action(body:Record<string,unknown>){const response=await fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});if(!response.ok)throw Error(response.status===401?'Access key is invalid. Please check it and try again.':response.status===429?'Too many failed attempts. Please wait 15 minutes and try again.':response.status===503?'Owner sign-in is temporarily unavailable. Please try again shortly.':'Could not update preview. Please try again.');}
export function PreviewControls({authorized,preview,previewGeo,configured,country}:{authorized:boolean;preview:boolean;previewGeo?:CoreGeo|null;configured:boolean;country:string|null}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function run(body:Record<string,unknown>){setBusy(true);setError('');try{await action(body);window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}
  function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,key=new FormData(form).get('key');form.reset();void run({action:'login',key});}
  return <main className="owner-preview-page"><h1>Owner GEO preview</h1><p>Trusted owner-only preview · no public country override</p>
    {!configured?<p>Owner access has not been configured.</p>:!authorized?<form onSubmit={login}><label htmlFor="owner-key">Private owner access key</label><input id="owner-key" name="key" type="password" autoComplete="current-password" required maxLength={128}/><button disabled={busy}>Sign in</button></form>:<>
      <p>Real connection: {country??'Unknown'} · <strong>{preview&&previewGeo?`${geoProfile(previewGeo).countryName} · QA_TEST`:'Real GEO'}</strong></p>
      <p>Preview traffic remains QA_TEST. Preview does not approve candidate operators or prove genuine local operator access.</p>
      <label>Experience <select disabled={busy} value={preview&&previewGeo?previewGeo:''} onChange={e=>void run({action:'preview',geo:e.target.value||null})}><option value="">Real GEO</option>{CORE_GEOS.map(geo=><option key={geo} value={geo}>{geoProfile(geo).countryName}</option>)}</select></label>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Re-read the owner session and preview headers with a full document request. */}
      {CORE_GEOS.map(geo=><a key={geo} href={`/${geoProfile(geo).locale}`}>{geoProfile(geo).countryName} →</a>)}<a href="/owner/commercial">Commercial Activation</a><a href="/owner/growth">Growth</a><a href="/owner/health">Odds health</a><a href="/owner/analytics">Analytics</a><button disabled={busy} onClick={()=>void run({action:'logout'})}>Sign out</button><p>This device stays signed in for 30 days. Keep your permanent access key private.</p>
    </>}{error?<p role="alert">{error}</p>:null}</main>;
}
export function OwnerPreviewBar({preview,previewGeo}:{preview:boolean;previewGeo?:CoreGeo|null}){
  const router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <aside className="owner-preview-bar" aria-label="Owner preview"><strong>{preview?'QA_TEST · GEO preview':'Owner · Real GEO'}</strong><label>GEO <select aria-label="Owner GEO" disabled={busy} value={preview?(previewGeo??''):''} onChange={async e=>{const geo=e.target.value;setBusy(true);try{await action({action:'preview',geo:geo||null});if(geo){router.push(`/${geoProfile(geo as CoreGeo).locale}`);router.refresh();setBusy(false);}else window.location.reload();}catch{setError('Open owner controls to sign in again.');setBusy(false);}}}><option value="">Real GEO</option>{CORE_GEOS.map(geo=><option key={geo} value={geo}>{geoProfile(geo).countryName}</option>)}</select></label><a href="/owner/preview">Owner controls</a>{error?<span role="alert">{error}</span>:null}</aside>;
}
