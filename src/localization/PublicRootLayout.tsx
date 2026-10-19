import './site-styles';
import type {ReactNode} from 'react';
import {languageTags,type InterfaceLocale} from './interface';
import {V2Footer} from '@/v2/Footer';
import {PublicEnhancements} from './PublicEnhancements';
import {PublicPresentation} from './PublicPresentation';

export function PublicRootLayout({children,locale}:{children:ReactNode;locale:InterfaceLocale}){
  // Shared App Router root document, not a Pages Router component.
  // eslint-disable-next-line @next/next/no-head-element
  return <html lang={languageTags[locale]} data-theme="light" suppressHydrationWarning data-scroll-behavior="smooth"><head><script dangerouslySetInnerHTML={{__html:'try{document.documentElement.dataset.theme=localStorage.getItem("livasports:theme")==="dark"?"dark":"light"}catch(e){}'}}/></head><body data-app="v2"><PublicPresentation><div className="site-content-wrapper">{children}<V2Footer locale={locale}/></div><PublicEnhancements/></PublicPresentation></body></html>;
}
