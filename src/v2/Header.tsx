'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useSyncExternalStore} from 'react';
import {ThemeToggle} from '@/components/sports/ThemeToggle';
import {LanguageSelector} from '@/localization/LanguageSelector';
import {AuthHeaderLink} from '@/auth/AuthHeaderLink';
import type {InterfaceLocale} from '@/localization/interface';
import {v2Copy} from './copy';
import {v2Path,type Section} from './routes';
import {Icon,type IconName} from './Icon';
import {newsCopy,newsPath} from '@/editorial/copy';
const editionKey='livasports:editorial-edition';
let volatileEdition:string|null=null;
const subscribe=(notify:()=>void)=>{window.addEventListener('livasports:edition',notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener('livasports:edition',notify);window.removeEventListener('storage',notify);};};
export function useEditorialEdition(locale:InterfaceLocale){
  const fallback=['mx','co','pe'].includes(locale)?locale:'mx';
  return useSyncExternalStore(subscribe,()=>{try{const value=volatileEdition??localStorage.getItem(editionKey);return value&&['mx','co','pe'].includes(value)?value:fallback;}catch{return volatileEdition??fallback;}},()=>fallback);
}
export function Brand(){return <span className="v2-brand">LIVA<span>SPORTS</span><i aria-hidden="true"/></span>;}
export function V2Header({locale}:{locale:InterfaceLocale}){
  const text=v2Copy(locale),path=usePathname(),edition=useEditorialEdition(locale);
  const links:({key:Section|'news'|undefined;label:string;icon:IconName})[]=[{key:undefined,label:text.home,icon:'home'},{key:'news',label:newsCopy(locale).news,icon:'book'},{key:'football',label:text.football,icon:'football'},{key:'analysis',label:text.analysis,icon:'book'},{key:'tools',label:text.tools,icon:'tools'},{key:'guides',label:text.guides,icon:'book'},{key:'bookmakers',label:text.bookmakers,icon:'shield'}];
  const linkPath=(key:Section|'news'|undefined)=>key==='news'?newsPath(locale):v2Path(locale,key);
  const closeMenu=()=>{const menu=document.getElementById('v2-main-menu') as HTMLDetailsElement|null;if(menu)menu.open=false;};
  return <><a className="v2-skip" href="#main-content">{text.skip}</a><header className="v2-header"><div className="v2-header-inner">
    <Link className="v2-brand-link" href={v2Path(locale)} aria-label="LivaSports"><Brand/></Link>
    <nav className="v2-desktop-nav" aria-label={text.menu}>{links.map(link=><Link key={link.label} href={linkPath(link.key)} aria-current={path===linkPath(link.key)?'page':undefined}>{link.label}</Link>)}</nav>
    <div className="v2-header-actions"><label className="v2-edition" title={text.editionNote}><span className="sr-only">{text.country}</span><select value={edition} aria-label={text.country} onChange={event=>{volatileEdition=event.target.value;try{localStorage.setItem(editionKey,event.target.value);}catch{}window.dispatchEvent(new Event('livasports:edition'));}}><option value="mx">MX</option><option value="co">CO</option><option value="pe">PE</option></select></label>
      <ThemeToggle locale={locale}/><Link className="v2-icon-button v2-search-link" href={v2Path(locale,'search')} aria-label={text.search}><Icon name="search"/></Link>
      <details id="v2-main-menu" className="v2-menu" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary className="v2-icon-button" aria-label={text.menu}><Icon name="menu"/></summary><div className="v2-menu-panel"><strong>{text.menu}</strong><nav aria-label={text.more}>{links.map(link=><Link onClick={closeMenu} key={link.label} href={linkPath(link.key)}><Icon name={link.icon}/>{link.label}</Link>)}<Link onClick={closeMenu} href={v2Path(locale,'search')}><Icon name="search"/>{text.search}</Link><Link onClick={closeMenu} href={v2Path(locale,'about')}><Icon name="user"/>{text.about}</Link></nav><LanguageSelector locale={locale}/><AuthHeaderLink locale={locale}/><small>{text.editionNote}</small></div></details>
    </div></div></header>
    <nav className="v2-bottom-nav" aria-label={text.menu}>{[links[0],links[1],links[2],links[4]].map(link=><Link key={link.label} href={linkPath(link.key)} aria-current={path===linkPath(link.key)?'page':undefined}><Icon name={link.icon}/><span>{link.label}</span></Link>)}<button type="button" onClick={()=>{const menu=document.getElementById('v2-main-menu') as HTMLDetailsElement|null;if(menu){menu.open=!menu.open;menu.querySelector('summary')?.focus();}}}><Icon name="menu"/><span>{text.more}</span></button></nav></>;
}
