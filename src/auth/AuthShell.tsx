import type {ReactNode} from 'react';
import '@/app/auth.css';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {languageTags,type InterfaceLocale} from '@/localization/interface';

export function AuthShell({locale,title,lead,children}:{locale:InterfaceLocale;title:string;lead?:string;children:ReactNode}){
  return <div className="app-shell auth-shell" lang={languageTags[locale]}>
    <SiteHeader locale={locale} activePage="home" contentId="auth-content"/>
    <main id="auth-content" className="auth-page">
      <h1>{title}</h1>
      {lead?<p className="auth-lead">{lead}</p>:null}
      {children}
    </main>
  </div>;
}
