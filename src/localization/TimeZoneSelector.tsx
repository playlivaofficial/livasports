'use client';
import {createContext,useContext,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import type {InterfaceLocale} from './interface';
import {resolveTimeZone,validTimeZone} from './time-zone';
const TimePreference=createContext<{manual:string|null;device:string|null}>({manual:null,device:null});
export function TimePreferenceProvider({manual,device,children}:{manual:string|null;device:string|null;children:ReactNode}){return <TimePreference.Provider value={{manual,device}}>{children}</TimePreference.Provider>;}
const subscribe=()=>()=>{};
const deviceZone=()=>validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)??'UTC';
const commonZones=['UTC','America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha','America/Mexico_City','America/Bogota','America/Lima','America/Cancun','America/Tijuana','America/New_York','America/Los_Angeles','Europe/London','Europe/Madrid','Europe/Berlin','Asia/Tbilisi','Asia/Tokyo','Australia/Sydney'];
const copy={br:{label:'Fuso horário',auto:'Usar horário do dispositivo',save:'Aplicar',device:'Neste dispositivo',note:'Altera apenas as datas e os horários dos jogos.'},mx:{label:'Zona horaria',auto:'Usar hora del dispositivo',save:'Aplicar',device:'En este dispositivo',note:'Solo cambia las fechas y horas de los partidos.'},en:{label:'Time zone',auto:'Use device time',save:'Apply',device:'This device',note:'Changes match dates and times only.'}};
export function TimeZoneSelector({locale}:{locale:InterfaceLocale}){
  const {manual,device}=useContext(TimePreference),timeZone=resolveTimeZone(locale,manual,device);
  const path=usePathname(),detected=useSyncExternalStore(subscribe,deviceZone,()=>''),t=copy[locale==='co'||locale==='pe'?'mx':locale];
  useEffect(()=>{
    if(manual||!detected||device===detected)return;
    // A browser that rejects preference cookies must never enter a reload loop.
    const attempt=`livasports:time-zone-detected:${detected}`;
    try{if(sessionStorage.getItem(attempt))return;sessionStorage.setItem(attempt,'1');}catch{return;}
    const data=new FormData();data.set('mode','device');data.set('timeZone',detected);
    let active=true;
    void fetch('/time-zone',{method:'POST',body:data,credentials:'same-origin',cache:'no-store'}).then(r=>{if(active&&r.ok&&detected!==timeZone)window.location.reload();}).catch(()=>{});
    return()=>{active=false;};
  },[locale,manual,device,detected,timeZone]);
  const zones=[...new Set([...commonZones,timeZone,...(detected?[detected]:[])])];
  return <details className="time-zone-picker" onKeyDown={e=>{if(e.key==='Escape'&&e.currentTarget.open){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
    <summary aria-label={`${t.label}: ${timeZone.replaceAll('_',' ')}`}><span aria-hidden="true">◷</span><span className="time-zone-caption">{t.label}</span></summary>
    <form action="/time-zone" method="post" onSubmit={e=>{(e.currentTarget.elements.namedItem('returnTo') as HTMLInputElement).value=location.pathname+location.search+location.hash;}}>
      <input type="hidden" name="mode" value="manual"/><input type="hidden" name="returnTo" value={path}/>
      <label>{t.label}<select name="timeZone" defaultValue={manual??'auto'}><option value="auto">{t.auto}</option>{zones.map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}{zone===detected?` · ${t.device}`:''}</option>)}</select></label>
      <p>{timeZone.replaceAll('_',' ')} · {t.note}</p><button type="submit">{t.save}</button>
    </form>
  </details>;
}
