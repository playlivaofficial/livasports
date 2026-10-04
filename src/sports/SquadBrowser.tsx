'use client';
import {isSpanishLocale} from '@/config/geo';
import {usePathname} from 'next/navigation';
import {useSyncExternalStore} from 'react';
import Link from 'next/link';
import type {SquadContext} from '@/profiles/types';
import {playerPath,type InterfaceLocale} from '@/localization/interface';
import {localizedPosition} from '@/profiles/localization';
import {PlayerAvatar} from '@/components/profile/PlayerAvatar';
import {countryMarkFromIso} from './country-mark';
import {CountryMarkIcon} from '@/components/sports/CountryMarkIcon';
const subscribe=(listener:()=>void)=>{window.addEventListener('popstate',listener);return()=>window.removeEventListener('popstate',listener);};
const querySnapshot=()=>window.location.search;
const serverSnapshot=()=>'';
export function SquadBrowser({locale,contexts}:{locale:InterfaceLocale;contexts:SquadContext[]}){
  const query=new URLSearchParams(useSyncExternalStore(subscribe,querySnapshot,serverSnapshot)),pathname=usePathname();
  const selected=contexts.find(c=>c.seasonId===query.get('squadSeason'))??contexts[0];
  const selectSeason=(season:string)=>{
    if(!contexts.some(c=>c.seasonId===season))return;
    const next=new URLSearchParams(query.toString());next.set('squadSeason',season);
    window.history.pushState(null,'',`${pathname}?${next}#squad`);window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const label=locale==='br'?'Elenco por temporada':isSpanishLocale(locale)?'Plantilla por temporada':'Squad by season';
  const positions=locale==='br'?['Goleiros','Defensores','Meio-campistas','Atacantes','Outros']:isSpanishLocale(locale)?['Porteros','Defensas','Mediocampistas','Delanteros','Otros']:['Goalkeepers','Defenders','Midfielders','Forwards','Other'];
  if(!selected)return null;
  return <><label className="sports-season">{label}<select value={selected.seasonId} onChange={e=>selectSeason(e.target.value)}>{contexts.map(c=><option key={c.seasonId} value={c.seasonId}>{c.competition} · {c.season}</option>)}</select></label><div className="squad-groups">{positions.map((position,i)=>{
    const players=selected.players.filter(p=>i<4?p.positionId===24+i:![24,25,26,27].includes(p.positionId??0));
    return players.length?<section key={position}><h3>{position}</h3><div className="squad-grid">{players.map(p=>{const mark=countryMarkFromIso(p.countryCode,p.nationality);return <Link prefetch={false} key={p.id} href={playerPath(locale,p.publicId,p.name)} className="squad-card"><PlayerAvatar name={p.name} imageUrl={p.imageUrl}/><span><strong>{p.countryCode?<CountryMarkIcon mark={mark} decorative={false} className="squad-country-mark"/>:null}{p.name}</strong><small>{locale==='en'?p.position??position:localizedPosition(locale,p.position)??position}{p.jerseyNumber!==null?` · ${p.jerseyNumber}`:''}</small></span></Link>;})}</div></section>:null;
  })}</div></>;
}
