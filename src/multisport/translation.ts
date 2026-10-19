import type {InterfaceLocale} from '@/localization/interface';

// Keep routing/catalogue translations independent of the V2 content/route graph.
export type Translation=Record<'en'|'es'|'pt',string>;
export const tr=(en:string,es:string,pt:string):Translation=>({en,es,pt});
export const translated=(value:Translation,locale:InterfaceLocale)=>value[locale==='en'?'en':locale==='br'?'pt':'es'];
