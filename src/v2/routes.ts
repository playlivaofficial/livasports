import type {InterfaceLocale} from '@/localization/interface';

export type EditorialLanguage='es'|'pt'|'en';
export const editorialLanguage=(locale:InterfaceLocale):EditorialLanguage=>locale==='en'?'en':locale==='br'?'pt':'es';
export const namespaces={
  es:{football:'futbol',analysis:'analisis',guides:'guias',tools:'herramientas',bookmakers:'casas-de-apuestas',leagues:'ligas',search:'buscar',about:'nosotros'},
  pt:{football:'futebol',analysis:'analises',guides:'guias',tools:'ferramentas',bookmakers:'casas-de-apostas',leagues:'ligas',search:'buscar',about:'sobre'},
  en:{football:'football',analysis:'analysis',guides:'guides',tools:'tools',bookmakers:'bookmakers',leagues:'leagues',search:'search',about:'about'},
} as const;
export type Section=keyof typeof namespaces.en;
export function v2Path(locale:InterfaceLocale,section?:Section,slug?:string){return `/${locale}${section?`/${namespaces[editorialLanguage(locale)][section]}`:''}${slug?`/${slug}`:''}`;}
export function sectionFromSlug(locale:InterfaceLocale,slug:string):Section|undefined{return (Object.keys(namespaces.en) as Section[]).find(key=>namespaces[editorialLanguage(locale)][key]===slug);}
export function translateEditorialPath(path:string,target:InterfaceLocale):string|null{
  const parts=path.split('/').filter(Boolean),source=parts[0] as InterfaceLocale;
  if(!['en','br','mx','co','pe'].includes(source)||parts.length<2||parts.length>3)return null;
  if(parts[1]===(source==='en'?'news':'noticias'))return `/${target}/${target==='en'?'news':'noticias'}${parts[2]?'/'+parts[2]:''}`;
  const section=sectionFromSlug(source,parts[1]);
  return section?v2Path(target,section,parts[2]):null;
}
export const toolIds=['lineup-builder','tactical-board','odds-calculator','football-quiz'] as const;
export type ToolId=typeof toolIds[number];
