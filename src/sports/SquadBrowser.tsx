'use client';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import type {SquadContext} from '@/profiles/types';
import {playerPath,type InterfaceLocale} from '@/localization/interface';
import {localizedPosition} from '@/profiles/localization';
import {PlayerAvatar} from '@/components/profile/PlayerAvatar';
export function SquadBrowser({locale,contexts}:{locale:InterfaceLocale;contexts:SquadContext[]}){
  const query=useSearchParams(),pathname=usePathname(),router=useRouter();
  const selected=contexts.find(c=>c.seasonId===query.get('squadSeason'))??contexts[0];
  const selectSeason=(season:string)=>{
    if(!contexts.some(c=>c.seasonId===season))return;
    const next=new URLSearchParams(query.toString());next.set('squadSeason',season);
    router.push(`${pathname}?${next}#squad`,{scroll:false});
  };
  const label=locale==='br'?'Elenco por temporada':locale==='mx'?'Plantilla por temporada':'Squad by season';
  const positions=locale==='br'?['Goleiros','Defensores','Meio-campistas','Atacantes','Outros']:locale==='mx'?['Porteros','Defensas','Mediocampistas','Delanteros','Otros']:['Goalkeepers','Defenders','Midfielders','Forwards','Other'];
  if(!selected)return null;
  return <><label className="sports-season">{label}<select value={selected.seasonId} onChange={e=>selectSeason(e.target.value)}>{contexts.map(c=><option key={c.seasonId} value={c.seasonId}>{c.competition} · {c.season}</option>)}</select></label><div className="squad-groups">{positions.map((position,i)=>{
    const players=selected.players.filter(p=>i<4?p.positionId===24+i:![24,25,26,27].includes(p.positionId??0));
    return players.length?<section key={position}><h3>{position}</h3><div className="squad-grid">{players.map(p=><Link prefetch={false} key={p.id} href={playerPath(locale,p.publicId,p.name)} className="squad-card"><PlayerAvatar name={p.name} imageUrl={p.imageUrl}/><span><strong>{p.name}</strong><small>{locale==='en'?p.position??position:localizedPosition(locale,p.position)??position}{p.jerseyNumber!==null?` · ${p.jerseyNumber}`:''}</small></span></Link>)}</div></section>:null;
  })}</div></>;
}
