'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
/** Revalidates this database-backed page; never calls a sports provider. */
export function BoardRefresh({live}:{live:boolean}){
  const router=useRouter();
  useEffect(()=>{if(!live)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')router.refresh();},60000);return()=>clearInterval(timer);},[live,router]);
  return null;
}
