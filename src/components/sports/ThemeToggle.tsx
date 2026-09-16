'use client';

import {useSyncExternalStore} from 'react';
import type {InterfaceLocale} from '@/localization/interface';

const storageKey='livasports:theme';
const changeEvent='livasports:theme-change';
const labels={br:{dark:'Ativar modo escuro',light:'Ativar modo claro'},mx:{dark:'Activar modo oscuro',light:'Activar modo claro'},en:{dark:'Switch to dark mode',light:'Switch to light mode'}};

function subscribe(notify:()=>void){
  const storage=(event:StorageEvent)=>{
    if(event.key!==storageKey&&event.key!==null)return;
    document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';
    notify();
  };
  window.addEventListener(changeEvent,notify);
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(changeEvent,notify);window.removeEventListener('storage',storage);};
}

export function ThemeToggle({locale}:{locale:InterfaceLocale}){
  const dark=useSyncExternalStore(subscribe,()=>document.documentElement.dataset.theme==='dark',()=>false);
  const label=labels[locale][dark?'light':'dark'];
  function toggle(){
    const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
    document.documentElement.dataset.theme=next;
    try{localStorage.setItem(storageKey,next);}catch{/* Theme still works when browser storage is disabled. */}
    window.dispatchEvent(new Event(changeEvent));
  }
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggle}>
    <svg className="theme-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.6 13.1A8.7 8.7 0 0 1 10.9 3.4 8.8 8.8 0 1 0 20.6 13.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
    <svg className="theme-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
  </button>;
}
