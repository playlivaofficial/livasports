'use client';
import Link from 'next/link';
import {useState} from 'react';
export interface IndividualEntry {id:string;name:string;href:string;rank:number;group:string;country?:string;points?:number;champion?:boolean}
export function IndividualRankings({entries,labels}:{entries:IndividualEntry[];labels:{search:string;all:string;category:string;empty:string;points:string;champion:string;neutral:string}}){
 const [query,setQuery]=useState(''),[group,setGroup]=useState('');
 const normalize=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
 const shown=entries.filter(e=>(!group||e.group===group)&&normalize(e.name).includes(normalize(query))),groups=[...new Set(entries.map(e=>e.group))];
 return <div className="ix-rankings"><div className="ix-search"><label>{labels.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>{groups.length>1?<label>{labels.category}<select value={group} onChange={e=>setGroup(e.target.value)}><option value="">{labels.all}</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>:null}</div><p className="ix-count" role="status">{shown.length} / {entries.length}</p><ol className="ix-ranking-list">{shown.map(e=><li key={e.id+'-'+e.group}><Link href={e.href}><span className={e.champion?'ix-rank ix-champion':'ix-rank'} aria-label={e.champion?labels.champion:undefined}>{e.champion?'C':e.rank}</span><span className="ix-player"><strong>{e.name}</strong><small>{e.country==='Neutral'?labels.neutral:e.country??e.group}</small></span>{e.points!==undefined?<span className="ix-points"><strong>{e.points.toLocaleString('en-US')}</strong><small>{labels.points}</small></span>:<span className="ix-category">{e.group}</span>}<span aria-hidden="true">↗</span></Link></li>)}</ol>{!shown.length?<p className="cx-empty">{labels.empty}</p>:null}</div>;
}
