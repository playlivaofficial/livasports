'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {matchSnapshotChanged,shouldCheckMatchSnapshot,type PublicMatchSnapshot} from '@/match-center/public-cache-policy';

const terminalStates=new Set(['FINISHED','CANCELLED','ABANDONED']);

export function LiveRefreshBoundary({publicId,locale,status,snapshotAt,kickoff,providerUpdatedAt}:{publicId:string;locale:'br'|'mx';status:string;snapshotAt:string|null;kickoff:string;providerUpdatedAt:string|null}){
  const router=useRouter();
  useEffect(()=>{
    if(terminalStates.has(status)) return;
    let stopped=false; let timer:number|undefined;
    const schedule=()=>{if(!stopped)timer=window.setTimeout(check,30_000)};
    const check=async()=>{
      if(stopped)return;
      if(document.hidden||!navigator.onLine||!shouldCheckMatchSnapshot(status,kickoff)){schedule();return;}
      try{const response=await fetch(`/api/matches/${publicId}?locale=${locale}`,{cache:'no-store'});if(response.ok){const data=await response.json() as PublicMatchSnapshot;
        // The existing score ticker invalidates the fixture tag immediately. Refresh
        // reads its fresh ISR shell; it does not force every crawler through SSR.
        if(data.status&&terminalStates.has(data.status)){router.refresh();schedule();return;}
        if(matchSnapshotChanged({status,snapshotAt,providerUpdatedAt},data))router.refresh();}}
      catch{ /* Preserve the visible snapshot and retry later. */ }
      schedule();
    };
    void check();return()=>{stopped=true;if(timer)window.clearTimeout(timer)};
  },[locale,publicId,router,snapshotAt,status,kickoff,providerUpdatedAt]);
  return null;
}
