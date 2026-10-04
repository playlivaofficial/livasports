'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {OwnerPreviewBar} from '@/owner/PreviewControls';
import {TimePreferenceProvider} from './TimeZoneSelector';
import {validTimeZone} from './time-zone';
import {isCoreGeo,type CoreGeo} from '@/config/geo';
import type {SiteLocale} from '@/config/i18n';

type Presentation={manual:string|null;device:string|null;commercialLocale:SiteLocale|null;owner:{authorized:boolean;preview:boolean;previewGeo:CoreGeo|null}};
const empty:Presentation={manual:null,device:null,commercialLocale:null,owner:{authorized:false,preview:false,previewGeo:null}};
const CommercialPresentation=createContext<SiteLocale|null>(null);
export function usePublicCommercialLocale(){return useContext(CommercialPresentation);}
/** A private, no-store read after hydration. No owner data is rendered into shared HTML. */
export function PublicPresentation({children}:{children:ReactNode}){
  const [value,setValue]=useState<Presentation>(empty);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/presentation',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(r=>r.ok?r.json():null).then(body=>{
        if(!body||controller.signal.aborted)return;
        // Keep persisted preferences distinct from browser detection. Pretending a
        // detected zone is saved prevents TimeZoneSelector's persistence/reload,
        // leaving the server-rendered board in a different zone from Growth.
        const manual=validTimeZone(body.manual),device=validTimeZone(body.device);
        const authorized=body.owner?.authorized===true,preview=authorized&&body.owner?.preview===true;
        const commercialLocale=['mx','co','pe'].includes(body.commercialLocale)?body.commercialLocale:null;
        setValue({manual,device,commercialLocale,owner:{authorized,preview,previewGeo:preview&&isCoreGeo(body.owner?.previewGeo)?body.owner.previewGeo:null}});
      }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
    return()=>controller.abort();
  },[]);
  return <CommercialPresentation.Provider value={value.commercialLocale}><TimePreferenceProvider manual={value.manual} device={value.device} ready={ready}>{value.owner.authorized?<OwnerPreviewBar preview={value.owner.preview} previewGeo={value.owner.previewGeo}/>:null}{children}</TimePreferenceProvider></CommercialPresentation.Provider>;
}
