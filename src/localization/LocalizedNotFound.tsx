import Link from 'next/link';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {interfaceRoutes,languageTags,type InterfaceLocale} from '@/localization/interface';
export function LocalizedNotFound({locale}:{locale:InterfaceLocale}){
  const text={br:{title:'Página não encontrada',body:'Este endereço não corresponde a uma página disponível.',back:'Voltar ao futebol'},
    mx:{title:'Página no encontrada',body:'Esta dirección no corresponde a una página disponible.',back:'Volver al fútbol'},
    en:{title:'Page not found',body:'This address does not match an available page.',back:'Back to football'}}[locale==='co'||locale==='pe'?'mx':locale];
  return <div lang={languageTags[locale]} className="app-shell"><meta name="robots" content="noindex, follow"/><SiteHeader locale={locale} activePage="football"/><main id="fixtures-content" className="page-container"><h1>{text.title}</h1><p>{text.body}</p><Link href={interfaceRoutes[locale].football}>{text.back}</Link></main></div>;
}
