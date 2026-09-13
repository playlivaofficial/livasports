'use client';

import {useEffect,useRef,useState} from 'react';
import {emitMatchEvent,type MatchEventContext} from '@/components/match/events';

export function SectionNav({items,label,className,context}:{
  items:Array<{href:string;label:string}>;
  label:string;
  className:string;
  context?:MatchEventContext;
}){
  const [active,setActive]=useState(items[0]?.href);
  const nav=useRef<HTMLElement>(null);
  const signature=items.map(item=>item.href).join(' ');

  useEffect(()=>{
    const sections=signature.split(' ')
      .map(href=>document.getElementById(href.slice(1)))
      .filter((section):section is HTMLElement=>!!section);
    const header=document.querySelector('.app-header');
    let frame=0;
    const update=()=>{
      frame=0;
      const stickyHeight=(header?.getBoundingClientRect().height??0)+(nav.current?.getBoundingClientRect().height??0);
      const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
      // Native anchor alignment includes both document scroll padding and the
      // destination's scroll margin. Keep the active section aligned with it.
      const aligned=sections.filter(section=>{
        const margin=parseFloat(getComputedStyle(section).scrollMarginTop)||0;
        return section.getBoundingClientRect().top<=Math.max(stickyHeight+16,padding+margin)+2;
      }).at(-1)??sections[0];
      // Several anchors can share the maximum scroll position on a short page.
      // In that case the visible hash target expresses the user's selection.
      const target=sections.find(section=>'#'+section.id===location.hash);
      const atEnd=Math.ceil(window.scrollY+window.innerHeight)>=document.documentElement.scrollHeight;
      const current=atEnd&&target&&target.getBoundingClientRect().top<window.innerHeight?target:aligned;
      if(current)setActive('#'+current.id);
    };
    const schedule=()=>{
      if(!frame)frame=requestAnimationFrame(update);
    };
    const resize=new ResizeObserver(schedule);
    if(header)resize.observe(header);
    if(nav.current)resize.observe(nav.current);
    sections.forEach(section=>resize.observe(section));
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    window.addEventListener('hashchange',schedule);
    schedule();
    return()=>{
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      window.removeEventListener('hashchange',schedule);
    };
  },[signature]);

  return <nav className={className} aria-label={label} ref={nav}>
    {items.map(item=><a key={item.href} href={item.href}
      aria-current={active===item.href?'location':undefined}
      onClick={()=>{
        setActive(item.href);
        if(context)emitMatchEvent('match_tab_view',context,item.href.slice(1));
      }}>{item.label}</a>)}
  </nav>;
}
