'use client';
import {usePathname} from 'next/navigation';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {interfaceRoutes,languageTags,pathLocale} from '@/localization/interface';
export default function ErrorPage({reset}:{reset:()=>void}){
  const locale=pathLocale(usePathname())??'en';
  const text={br:{title:'Não foi possível carregar esta página',body:'As informações esportivas estão temporariamente indisponíveis.',retry:'Tentar novamente',back:'Voltar ao início'},
    mx:{title:'No se pudo cargar esta página',body:'La información deportiva no está disponible temporalmente.',retry:'Intentar de nuevo',back:'Volver al inicio'},
    en:{title:'Unable to load this page',body:'The sports information is temporarily unavailable.',retry:'Try again',back:'Back to home'}}[locale];
  return <div lang={languageTags[locale]} className="app-shell"><SiteHeader locale={locale} activePage="football"/><main id="fixtures-content" className="page-container"><h1>{text.title}</h1><p>{text.body}</p><button className="match-share" onClick={reset}>{text.retry}</button> <a href={interfaceRoutes[locale].home}>{text.back}</a></main></div>;
}
