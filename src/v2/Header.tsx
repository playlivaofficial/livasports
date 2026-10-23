'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ThemeToggle} from '@/components/sports/ThemeToggle';
import {LanguageSelector} from '@/localization/LanguageSelector';
import {AuthHeaderLink} from '@/auth/AuthHeaderLink';
import type {InterfaceLocale} from '@/localization/interface';
import {v2Copy} from './copy';
import {v2Path} from './routes';
import {Icon,type IconName} from './Icon';
import {newsCopy,newsPath} from '@/editorial/copy';
import {sportsPath} from '@/multisport/catalog';
/** Compatibility for older editorial consumers. Public country preferences are no longer read. */
export function useEditorialEdition(locale:InterfaceLocale):string{void locale;return 'international';}
export function Brand(){return <span className="v2-brand">LIVA<span>SPORTS</span><i aria-hidden="true"/></span>;}
export function V2Header({locale}:{locale:InterfaceLocale}){
  const text=v2Copy(locale),path=usePathname();
  type NavLink={href:string;label:string;icon:IconName};
  const home:NavLink={href:v2Path(locale),label:text.home,icon:'home'},sports:NavLink={href:sportsPath(locale),label:locale==='en'?'Sports':locale==='br'?'Esportes':'Deportes',icon:'football'},news:NavLink={href:newsPath(locale),label:newsCopy(locale).news,icon:'book'};
  const tables:NavLink={href:sportsPath(locale)+'#standings',label:locale==='en'?'Tables':locale==='br'?'Tabelas':'Tablas',icon:'tools'};
  const links:NavLink[]=[sports,news,{...tables,label:locale==='en'?'Standings':locale==='br'?'Classificações':'Clasificaciones'},{href:v2Path(locale,'tools'),label:text.tools,icon:'tools'}];
  const more:NavLink[]=[home,...links,{href:v2Path(locale,'analysis'),label:text.analysis,icon:'book'},{href:v2Path(locale,'guides'),label:text.guides,icon:'book'},{href:v2Path(locale,'bookmakers'),label:text.bookmakers,icon:'shield'}];
  const closeMenu=()=>{const menu=document.getElementById('v2-main-menu') as HTMLDetailsElement|null;if(menu)menu.open=false;};
  return <><a className="v2-skip" href="#main-content">{text.skip}</a><header className="v2-header"><div className="v2-header-inner">
    <Link className="v2-brand-link" href={v2Path(locale)} aria-label="LivaSports"><Brand/></Link>
    <nav className="v2-desktop-nav" aria-label={text.menu}>{links.map(link=><Link key={link.label} href={link.href} aria-current={path===link.href?'page':undefined}>{link.label}</Link>)}</nav>
    <div className="v2-header-actions"><LanguageSelector locale={locale} compact/>
      <div className="v2-header-theme"><ThemeToggle locale={locale}/></div><div className="v2-header-session"><AuthHeaderLink locale={locale}/></div>
      <Link className="v2-icon-button v2-search-link" href={v2Path(locale,'search')} aria-label={text.search}><Icon name="search"/></Link>
      <details id="v2-main-menu" className="v2-menu" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary className="v2-icon-button" aria-label={text.menu}><Icon name="menu"/></summary><div className="v2-menu-panel"><strong>{text.menu}</strong><nav aria-label={text.more}>{more.map(link=><Link onClick={closeMenu} key={link.label} href={link.href}><Icon name={link.icon}/>{link.label}</Link>)}<Link onClick={closeMenu} href={v2Path(locale,'search')}><Icon name="search"/>{text.search}</Link><Link onClick={closeMenu} href={v2Path(locale,'about')}><Icon name="user"/>{text.about}</Link></nav><div className="v2-menu-appearance"><span>{locale==='en'?'Appearance':locale==='br'?'Aparência':'Apariencia'}</span><ThemeToggle locale={locale}/></div><AuthHeaderLink locale={locale}/></div></details>
    </div></div></header>
    <nav className="v2-bottom-nav" aria-label={text.menu}>{[home,sports,news,tables].map(link=><Link key={link.label} href={link.href} aria-current={path===link.href?'page':undefined}><Icon name={link.icon}/><span>{link.label}</span></Link>)}<button type="button" onClick={()=>{const menu=document.getElementById('v2-main-menu') as HTMLDetailsElement|null;if(menu){menu.open=!menu.open;menu.querySelector('summary')?.focus();}}}><Icon name="menu"/><span>{text.more}</span></button></nav></>;
}
