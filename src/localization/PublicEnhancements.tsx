'use client';
import {Suspense,useSyncExternalStore} from 'react';
import {LegacyPageShell} from './LegacyPageShell';
import {AnalyticsBoot} from '@/analytics/AnalyticsBoot';
import {usePublicCommercialLocale} from './PublicPresentation';
const subscribe=()=>()=>{};
/** These browser-only tools must not introduce a streaming boundary above a
 * canonical page's identity validation. They have no indexable server content. */
export function PublicEnhancements(){
  const hydrated=useSyncExternalStore(subscribe,()=>true,()=>false);
  const commercialLocale=usePublicCommercialLocale();
  return hydrated?<Suspense fallback={null}><LegacyPageShell commercialLocale={commercialLocale}/><AnalyticsBoot/></Suspense>:null;
}
