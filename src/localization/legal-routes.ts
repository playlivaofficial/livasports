import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';
export const legalKinds=['responsible','disclosure','terms','privacy'] as const;
export type LegalKind=typeof legalKinds[number];
export const legalSlugs=withSpanishLocales({
  br:{responsible:'jogo-responsavel',disclosure:'divulgacao-de-afiliados',terms:'termos',privacy:'privacidade'},
  mx:{responsible:'juego-responsable',disclosure:'divulgacion-de-afiliados',terms:'terminos',privacy:'privacidad'},
  en:{responsible:'responsible-gambling',disclosure:'affiliate-disclosure',terms:'terms',privacy:'privacy'},
} as const);
export const legalPath=(locale:InterfaceLocale,kind:LegalKind)=>`/${locale}/${legalSlugs[locale][kind]}`;
export function legalKind(locale:InterfaceLocale,slug:string){return legalKinds.find(k=>legalSlugs[locale][k]===slug)??null;}
