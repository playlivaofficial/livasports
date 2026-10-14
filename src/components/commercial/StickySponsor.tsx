'use client';
import {useEffect,useRef,type ReactNode} from 'react';

/** One existing creative stays mounted; scrolling never resolves another offer or impression. */
export function StickySponsor({children}:{children:ReactNode}){
  const shell=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=document.documentElement,observed=new Set<Element>();let frame=0;
    const measure=()=>{
      const owner=document.querySelector('.owner-preview-bar'),header=document.querySelector('.app-header');
      for(const el of [owner,header,shell.current])if(el&&!observed.has(el)){observed.add(el);resize.observe(el);}
      const height=(el:Element|null)=>el?.getBoundingClientRect().height??0;
      root.style.setProperty('--commercial-owner-height',`${height(owner)}px`);
      root.style.setProperty('--commercial-nav-height',`${height(owner)+height(header)}px`);
      root.style.setProperty('--mobile-sponsor-height',`${height(shell.current)}px`);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule),mutation=new MutationObserver(schedule);
    mutation.observe(document.body,{childList:true,subtree:true});schedule();
    return()=>{resize.disconnect();mutation.disconnect();cancelAnimationFrame(frame);
      for(const key of ['--commercial-owner-height','--commercial-nav-height','--mobile-sponsor-height'])root.style.removeProperty(key);};
  },[]);
  return <div ref={shell} className="sticky-sponsor-shell" data-sticky-sponsor="true">{children}</div>;
}
