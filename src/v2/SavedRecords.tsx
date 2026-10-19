'use client';
import Link from 'next/link';
import {useSyncExternalStore} from 'react';
import {FAVORITE_STORAGE_KEY} from '@/favorites/identity';
import {parseGuestFavorites} from '@/favorites/guest';
import {matchPath,teamPath,type InterfaceLocale} from '@/localization/interface';
import {competitionName} from '@/sports/policy';
import {competitionDisposition} from './retirement-policy';
import {tr,translated} from './content';
export interface StoredFavorite {kind:'team'|'fixture'|'competition';id:string;name:string}
const subscribe=(listener:()=>void)=>{window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);};
export function SavedRecords({locale,records,error=false}:{locale:InterfaceLocale;records:StoredFavorite[]|null;error?:boolean}){
 const raw=useSyncExternalStore(subscribe,()=>{try{return localStorage.getItem(FAVORITE_STORAGE_KEY)??'';}catch{return '';}},()=>'');
 const guest=parseGuestFavorites(raw);
 const rows=records??[...guest.teams.map(id=>({kind:'team' as const,id,name:`${translated(tr('Team','Equipo','Time'),locale)} · ${id}`})),...guest.fixtures.map(id=>({kind:'fixture' as const,id,name:`${translated(tr('Match','Partido','Jogo'),locale)} · ${id}`})),...guest.competitions.map(id=>({kind:'competition' as const,id,name:competitionName(locale,id)??id}))];
 if(error)return <p role="alert">{translated(tr('Saved records could not be loaded. Your data has not been changed; try again later.','No se pudieron cargar los registros. Tus datos no han cambiado; vuelve a intentarlo más tarde.','Não foi possível carregar os registros. Seus dados não foram alterados; tente mais tarde.'),locale)}</p>;
 return <section className="v2-prose"><p>{records===null?translated(tr('Records saved in this browser. Sign in to see account favorites.','Registros de este navegador. Inicia sesión para ver los favoritos de tu cuenta.','Registros deste navegador. Entre para ver os favoritos da conta.'),locale):translated(tr('Historical account favorites. These are not a live schedule.','Favoritos históricos de tu cuenta. No son un calendario en vivo.','Favoritos históricos da conta. Não são uma agenda ao vivo.'),locale)}</p>{rows.length?<ul className="v2-saved-records">{rows.map(row=>{const path=row.kind==='team'?teamPath(locale,row.id,row.name):row.kind==='fixture'?matchPath(locale,row.id,'archive','record'):competitionDisposition(locale,row.id,null).path;return <li key={`${row.kind}-${row.id}`}>{path?<Link prefetch={false} href={path}>{row.name} ↗</Link>:<span>{row.name}</span>}</li>;})}</ul>:<p>{translated(tr('No saved records here yet.','No hay registros guardados aquí.','Não há registros salvos aqui.'),locale)}</p>}</section>;
}
