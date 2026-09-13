'use client';
import {useState,type FormEvent} from 'react';

async function action(body:Record<string,unknown>){const response=await fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});if(!response.ok)throw Error(response.status===401?'Access key is invalid or your session expired. Please sign in again.':'Could not update preview. Please try again.');}
export function PreviewControls({authorized,preview,configured,country}:{authorized:boolean;preview:boolean;configured:boolean;country:string|null}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function run(body:Record<string,unknown>){setBusy(true);setError('');try{await action(body);window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}
  function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,key=new FormData(form).get('key');form.reset();void run({action:'login',key});}
  return <main className="owner-preview-page"><h1>Owner preview</h1><p>Brazil commercial experience · no VPN needed</p>
    {!configured?<p>Owner access has not been configured.</p>:!authorized?<form onSubmit={login}><label htmlFor="owner-key">Private owner access key</label><input id="owner-key" name="key" type="password" autoComplete="current-password" required maxLength={128}/><button disabled={busy}>Sign in</button></form>:<>
      <p>Connection: {country??'Unknown'} · Brazil preview: <strong>{preview?'ON':'OFF'}</strong></p>
      <p>Preview clicks and impressions are QA_TEST. Test links open a confirmation here and never send a real conversion to Betsson.</p>
      <button disabled={busy} onClick={()=>void run({action:'preview',enabled:!preview})}>{preview?'Turn Brazil preview off':'Turn Brazil preview on'}</button>
      <a href="/br">Open Brazil site →</a><button disabled={busy} onClick={()=>void run({action:'logout'})}>Sign out</button><p>Access expires after 8 hours. Keep your access key private.</p>
    </>}{error?<p role="alert">{error}</p>:null}</main>;
}
export function OwnerPreviewBar({preview}:{preview:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <aside className="owner-preview-bar" aria-label="Owner preview"><strong>{preview?'QA_TEST · Brazil preview ON':'Owner · Brazil preview OFF'}</strong><button disabled={busy} onClick={async()=>{setBusy(true);try{await action({action:'preview',enabled:!preview});window.location.reload();}catch{setError('Open owner controls to sign in again.');setBusy(false);}}}>{preview?'Turn off':'Turn on'}</button><a href="/owner/preview">Owner controls</a>{error?<span role="alert">{error}</span>:null}</aside>;
}
