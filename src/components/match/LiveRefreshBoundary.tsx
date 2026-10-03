'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type {SiteLocale} from '@/config/i18n';

const liveStates=new Set(['LIVE','HALFTIME']);
const terminalStates=new Set(['FINISHED','CANCELLED','ABANDONED']);

export function LiveRefreshBoundary({publicId,locale,status,snapshotAt}:{publicId:string;locale:SiteLocale;status:string;snapshotAt:string|null}){
  const router=useRouter();
  useEffect(()=>{
    if(!liveStates.has(status)) return;
    let stopped=false; let timer:number|undefined;
    const schedule=()=>{if(!stopped)timer=window.setTimeout(check,30_000)};
    const check=async()=>{
      if(stopped)return;
      if(document.hidden||!navigator.onLine){schedule();return;}
      try{const response=await fetch(`/api/matches/${publicId}?locale=${locale}`,{cache:'no-store'});if(response.ok){const data=await response.json() as {status?:string;snapshotAt?:string|null};
        if(data.status&&terminalStates.has(data.status)){stopped=true;router.refresh();return;}
        if(data.snapshotAt&&data.snapshotAt!==snapshotAt)router.refresh();}}
      catch{ /* Preserve the visible snapshot and retry later. */ }
      schedule();
    };
    schedule();return()=>{stopped=true;if(timer)window.clearTimeout(timer)};
  },[locale,publicId,router,snapshotAt,status]);
  return null;
}
