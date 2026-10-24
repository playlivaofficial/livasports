'use client';
import Link from 'next/link';
import {useState} from 'react';
import {IdentityLogo} from './IdentityLogo';
import {identityAsset} from './identity-assets';
export interface BasketballClub {id:string;name:string;division?:string;conference?:string;href?:string;record?:string}
function ClubIdentity({competitionId,name}:{competitionId:string;name:string}){return identityAsset(competitionId,name)?<IdentityLogo competitionId={competitionId} teamName={name}/>:<span className="cx-nameplate" aria-hidden="true">{name.split(/\s+/).slice(0,2).map(x=>x[0]).join('')}</span>;}
export function BasketballDirectory({clubs,competitionId,labels}:{clubs:BasketballClub[];competitionId:string;labels:{search:string;all:string;division:string;empty:string;profile:string}}){
 const [query,setQuery]=useState(''),[division,setDivision]=useState('');
 const normalize=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
 const shown=clubs.filter(c=>(!division||c.division===division)&&normalize(c.name).includes(normalize(query)));
 const divisions=[...new Set(clubs.flatMap(c=>c.division?[c.division]:[]))];
 return <div className="bk-directory"><div className="bk-search"><label>{labels.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={labels.search}/></label>{divisions.length?<label>{labels.division}<select value={division} onChange={e=>setDivision(e.target.value)}><option value="">{labels.all}</option>{divisions.map(d=><option key={d}>{d}</option>)}</select></label>:null}</div><p className="bk-count" role="status">{shown.length} / {clubs.length}</p><div className="bk-clubs">{shown.map(club=>{const content=<><ClubIdentity competitionId={competitionId} name={club.name}/><div><strong>{club.name}</strong><small>{[club.conference,club.division].filter(Boolean).join(' · ')}</small></div>{club.record?<b>{club.record}</b>:null}{club.href?<span aria-hidden="true">↗</span>:null}</>;return club.href?<Link className="bk-club" key={club.id} href={club.href} aria-label={`${club.name} — ${labels.profile}`}>{content}</Link>:<div className="bk-club" key={club.id}>{content}</div>;})}</div>{!shown.length?<p className="cx-empty">{labels.empty}</p>:null}</div>;
}
