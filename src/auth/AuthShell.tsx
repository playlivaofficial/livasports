import type {ReactNode} from 'react';
import '@/app/auth.css';
import {V2Header} from '@/v2/Header';
import {languageTags,type InterfaceLocale} from '@/localization/interface';

export function AuthShell({locale,title,lead,children}:{locale:InterfaceLocale;title:string;lead?:string;children:ReactNode}){
  return <div className="v2-shell auth-shell" lang={languageTags[locale]}>
    <V2Header locale={locale}/>
    <main id="main-content" className="auth-page">
      <h1>{title}</h1>
      {lead?<p className="auth-lead">{lead}</p>:null}
      {children}
    </main>
  </div>;
}
