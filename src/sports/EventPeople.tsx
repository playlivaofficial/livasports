import Link from 'next/link';
import {playerPath,type InterfaceLocale} from '@/localization/interface';
import type {MatchEventView} from '@/match-center/types';

const copy={br:{on:'Entra',off:'Sai',assist:'Assistência'},mx:{on:'Entra',off:'Sale',assist:'Asistencia'},en:{on:'On',off:'Off',assist:'Assist'}};

/** Sportmonks: substitution player is incoming; related player is outgoing. */
export function EventPeople({event,locale}:{event:MatchEventView;locale:InterfaceLocale}){
  const t=copy[locale==='co'||locale==='pe'?'mx':locale],substitution=event.type.toUpperCase()==='SUBSTITUTION';
  const person=(name:string,id:string|null)=>id?<Link prefetch={false} href={playerPath(locale,id,name)}>{name}</Link>:name;
  return <span>
    {event.playerName?<>{substitution?`${t.on}: `:''}{person(event.playerName,event.playerPublicId)}</>:null}
    {event.relatedPlayerName?<>{event.playerName?' · ':''}{substitution?`${t.off}: `:event.type.toUpperCase()==='GOAL'?`${t.assist}: `:''}{person(event.relatedPlayerName,event.relatedPlayerPublicId)}</>:null}
    {event.result?`${event.playerName||event.relatedPlayerName?' · ':''}${event.result}`:null}
  </span>;
}
