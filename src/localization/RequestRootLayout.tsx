import './site-styles';
import {requestOwnerSession} from '@/owner/session';
import {OwnerPreviewBar} from '@/owner/PreviewControls';
import {Suspense} from 'react';
import {headers} from 'next/headers';
import {isInterfaceLocale,languageTags} from '@/localization/interface';
import {V2Footer} from '@/v2/Footer';
import {requestTimePreference} from '@/localization/time-zone-server';
import {TimePreferenceProvider} from '@/localization/TimeZoneSelector';
import {AnalyticsBoot} from '@/analytics/AnalyticsBoot';

export default async function RequestRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h=await headers(),session=requestOwnerSession(h);
  const value=h.get('x-livasports-interface-language');
  const language=isInterfaceLocale(value)?languageTags[value]:'en';
  const locale=isInterfaceLocale(value)?value:'en',timePreference=await requestTimePreference(locale);
  // Shared App Router root document, not a Pages Router component.
  // eslint-disable-next-line @next/next/no-head-element
  return <html lang={language} data-theme="light" suppressHydrationWarning data-scroll-behavior="smooth"><head><script dangerouslySetInnerHTML={{__html:'try{document.documentElement.dataset.theme=localStorage.getItem("livasports:theme")==="dark"?"dark":"light"}catch(e){}'}}/></head><body data-app="v2"><TimePreferenceProvider {...timePreference}>{session?<OwnerPreviewBar preview={session.preview} previewGeo={session.previewGeo}/>:null}<div className="site-content-wrapper">{children}<V2Footer locale={locale}/></div><Suspense fallback={null}><AnalyticsBoot/></Suspense></TimePreferenceProvider></body></html>;
}
