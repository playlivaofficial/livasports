import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';
// P2 evergreen help topics. Slugs are localized identities; the topic key is the cross-locale cluster.
export const helpKinds=['comparison','decimalOdds','favorites'] as const;
export type HelpKind=typeof helpKinds[number];
export const helpSlugs=withSpanishLocales({
  br:{comparison:'como-funciona-a-comparacao-de-odds',decimalOdds:'como-ler-odds-decimais',favorites:'favoritos-e-meus-jogos'},
  mx:{comparison:'como-funciona-la-comparacion-de-cuotas',decimalOdds:'como-leer-cuotas-decimales',favorites:'favoritos-y-mis-partidos'},
  en:{comparison:'how-odds-comparison-works',decimalOdds:'how-to-read-decimal-odds',favorites:'favorites-and-my-matches'},
} as const);
export const helpPath=(locale:InterfaceLocale,kind:HelpKind)=>`/${locale}/${helpSlugs[locale][kind]}`;
export function helpKind(locale:InterfaceLocale,slug:string){return helpKinds.find(k=>helpSlugs[locale][k]===slug)??null;}
