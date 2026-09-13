import {headers} from 'next/headers';
import Link from 'next/link';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {isInterfaceLocale,interfaceRoutes,languageTags} from '@/localization/interface';
export default async function NotFound(){
  const value=(await headers()).get('x-livasports-interface-language');const locale=isInterfaceLocale(value)?value:'en';
  const text={br:{title:'Página não encontrada',body:'Este endereço não corresponde a uma página disponível.',back:'Voltar ao futebol'},
    mx:{title:'Página no encontrada',body:'Esta dirección no corresponde a una página disponible.',back:'Volver al fútbol'},
    en:{title:'Page not found',body:'This address does not match an available page.',back:'Back to football'}}[locale];
  return <div lang={languageTags[locale]} className="app-shell"><SiteHeader locale={locale} activePage="football"/><main id="fixtures-content" className="page-container"><h1>{text.title}</h1><p>{text.body}</p><Link href={interfaceRoutes[locale].football}>{text.back}</Link></main></div>;
}
