'use client';
import {useEffect,useRef,useState} from 'react';
import {emitMatchEvent,type MatchEventContext} from '@/components/match/events';

export function SectionNav({items,label,className,context}:{items:Array<{href:string;label:string}>;label:string;className:string;context?:MatchEventContext}){
  const [active,setActive]=useState(items[0]?.href);
  const nav=useRef<HTMLElement>(null);
  const signature=items.map(i=>i.href).join(' ');
  useEffect(()=>{
    const ids=signature.split(' '),sections=ids.map(href=>document.getElementById(href.slice(1))).filter((s):s is HTMLElement=>!!s);
    const headerHeight=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'));
    // Read the actual sticky header: the CSS token can use rem as well as px.
    const top=document.querySelector('.app-header')?.getBoundingClientRect().height??headerHeight;
    const observer=new IntersectionObserver(()=>{
      const boundary=top+(nav.current?.getBoundingClientRect().height??48)+36;
      const current=sections.filter(s=>s.getBoundingClientRect().top<=boundary).at(-1)??sections[0];
      if(current)setActive('#'+current.id);
    },{rootMargin:`-${top+48}px 0px -55% 0px`,threshold:0});
    sections.forEach(s=>observer.observe(s));
    return()=>observer.disconnect();
  },[signature]);
  return <nav className={className} aria-label={label} ref={nav}>{items.map(item=><a key={item.href} href={item.href} aria-current={active===item.href?'location':undefined} onClick={()=>{setActive(item.href);if(context)emitMatchEvent('match_tab_view',context,item.href.slice(1));}}>{item.label}</a>)}</nav>;
}
