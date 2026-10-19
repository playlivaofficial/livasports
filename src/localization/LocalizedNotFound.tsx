import Link from 'next/link';
import {V2Header} from '@/v2/Header';
import {interfaceRoutes,languageTags,type InterfaceLocale} from '@/localization/interface';
export function LocalizedNotFound({locale}:{locale:InterfaceLocale}){
  const text={br:{title:'Página não encontrada',body:'Este endereço não corresponde a uma página disponível.',back:'Voltar ao futebol'},
    mx:{title:'Página no encontrada',body:'Esta dirección no corresponde a una página disponible.',back:'Volver al fútbol'},
    en:{title:'Page not found',body:'This address does not match an available page.',back:'Back to football'}}[locale==='co'||locale==='pe'?'mx':locale];
  return <div lang={languageTags[locale]} className="v2-shell"><meta name="robots" content="noindex, follow"/><V2Header locale={locale}/><main id="main-content" className="v2-main"><div className="v2-page-heading"><h1>{text.title}</h1><p>{text.body}</p></div><Link className="v2-button" href={interfaceRoutes[locale].football}>{text.back}</Link></main></div>;
}
