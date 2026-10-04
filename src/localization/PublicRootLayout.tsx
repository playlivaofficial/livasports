import './site-styles';
import type {ReactNode} from 'react';
import {languageTags,type InterfaceLocale} from './interface';
import {SiteFooter} from './LegalPage';
import {PublicEnhancements} from './PublicEnhancements';
import {PublicPresentation} from './PublicPresentation';

export function PublicRootLayout({children,locale}:{children:ReactNode;locale:InterfaceLocale}){
  // Shared App Router root document, not a Pages Router component.
  // eslint-disable-next-line @next/next/no-head-element
  return <html lang={languageTags[locale]} data-theme="light" suppressHydrationWarning data-scroll-behavior="smooth"><head><script dangerouslySetInnerHTML={{__html:'try{document.documentElement.dataset.theme=localStorage.getItem("livasports:theme")==="dark"?"dark":"light"}catch(e){}'}}/></head><body><PublicPresentation><div className="site-content-wrapper">{children}<SiteFooter locale={locale}/></div><PublicEnhancements/></PublicPresentation></body></html>;
}
