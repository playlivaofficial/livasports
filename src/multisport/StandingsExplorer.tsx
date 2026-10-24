'use client';
import {useState,type ReactNode} from 'react';
export function StandingsExplorer({groups,labels}:{groups:{id:string;label:string;content:ReactNode}[];labels:{all:string;label:string}}){
 const [selected,setSelected]=useState('all');
 return <div className="cx-explorer"><div className="cx-filters" role="group" aria-label={labels.label}><button type="button" aria-pressed={selected==='all'} onClick={()=>setSelected('all')}>{labels.all}</button>{groups.map(group=><button key={group.id} type="button" aria-pressed={selected===group.id} onClick={()=>setSelected(group.id)}>{group.label}</button>)}</div>{groups.map(group=><section key={group.id} className="cx-conference" hidden={selected!=='all'&&selected!==group.id} aria-label={group.label}><h3>{group.label}</h3><div className="cx-division-grid">{group.content}</div></section>)}</div>;
}
