'use client';
import {useState} from 'react';
import {candidateDraft,undiscoveredCandidates,validateDiscoveryPackage,type DiscoveryPackage} from './discovery';
import type {NewsRecord} from './model';

/** Local metadata import only: publication still requires the existing authenticated review flow. */
export function DiscoveryImport({records,onSaved}:{records:NewsRecord[];onSaved:(record:NewsRecord)=>void}){
  const [pack,setPack]=useState<DiscoveryPackage|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const candidates=pack?undiscoveredCandidates(pack,records):[];
  async function read(file:File|undefined){
    setPack(null);setStatus('');if(!file)return;
    if(file.size>64000){setStatus('File too large. Use the bounded discovery package.');return;}
    try{const value:unknown=JSON.parse(await file.text());if(!validateDiscoveryPackage(value))throw new Error();setPack(value);setStatus('Links loaded privately. Dates, facts, rights and original text still need your review.');}
    catch{setStatus('Invalid discovery package. Nothing was saved.');}
  }
  async function save(index:number){
    const candidate=candidates[index];if(!candidate)return;setBusy(true);
    try{
      const draft=candidateDraft(candidate),response=await fetch('/api/owner/news',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',slug:draft.slug,revision:0,draft})});
      const result=await response.json() as {record?:NewsRecord;error?:string};
      if(!response.ok||!result.record){setStatus(result.error==='DUPLICATE_SOURCE'?'This source is already in the newsroom. Reload records; do not duplicate it.':'Candidate was not saved. Reload records before retrying if the connection was interrupted.');return;}
      onSaved(result.record);setStatus('Private research candidate saved in the editorial collection. No article was published.');
    }catch{setStatus('Connection interrupted. Reload records before retrying.');}finally{setBusy(false);}
  }
  return <details className="ed-help"><summary>Daily source discovery → private candidates</summary><p>Run the local discovery task once per day, then load its owner-candidates.json package here. It checks only approved source indexes and robots rules; no full articles or images are copied. No scheduled publication or paid API is involved.</p><label>Load local discovery package<input type="file" accept="application/json,.json" disabled={busy} onChange={event=>void read(event.target.files?.[0])}/></label>{pack?<p>Discovered {new Date(pack.discoveredAt).toLocaleString('en-GB')} · {candidates.length} new links. Existing sources are excluded.</p>:null}<ul>{candidates.map((candidate,index)=><li key={candidate.url}><a href={candidate.url} target="_blank" rel="noopener noreferrer">{candidate.headline}</a><p>{candidate.sourceDate??'Source date not verified'} · {candidate.desk}</p><button type="button" className="v2-button v2-button-outline" disabled={busy} onClick={()=>void save(index)}>Save private candidate</button></li>)}</ul><p role="status">{status}</p></details>;
}
