'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {OwnerPreviewBar} from '@/owner/PreviewControls';
import {TimePreferenceProvider} from './TimeZoneSelector';
import {validTimeZone} from './time-zone';

type Presentation={manual:string|null;device:string|null;owner:{authorized:boolean;preview:boolean}};
const empty:Presentation={manual:null,device:null,owner:{authorized:false,preview:false}};
/** A private, no-store read after hydration. No owner data is rendered into shared HTML. */
export function PublicPresentation({children}:{children:ReactNode}){
  const [value,setValue]=useState<Presentation>(empty);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/presentation',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(r=>r.ok?r.json():null).then(body=>{
        if(!body||controller.signal.aborted)return;
        const manual=validTimeZone(body.manual),device=validTimeZone(body.device)??validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        setValue({manual,device,owner:{authorized:body.owner?.authorized===true,preview:body.owner?.authorized===true&&body.owner?.preview===true}});
      }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
    return()=>controller.abort();
  },[]);
  return <TimePreferenceProvider manual={value.manual} device={value.device} ready={ready}>{value.owner.authorized?<OwnerPreviewBar preview={value.owner.preview}/>:null}{children}</TimePreferenceProvider>;
}
