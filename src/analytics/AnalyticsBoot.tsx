'use client';
import {useEffect} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {trackNavigation} from './client';

/** Mounted once in the root layout: session start, landing, page and entity views on every route change. Renders nothing. */
export function AnalyticsBoot(){
  const pathname=usePathname();const search=useSearchParams();
  const query=search?.toString()??'';
  useEffect(()=>{if(pathname)trackNavigation(pathname,query?`?${query}`:'');},[pathname,query]);
  return null;
}
