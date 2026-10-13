import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';
// P2 evergreen help topics. Slugs are localized identities; the topic key is the cross-locale cluster.
export const helpKinds=['comparison','decimalOdds','favorites','markets','slipComparison'] as const;
export type HelpKind=typeof helpKinds[number];
export const helpSlugs=withSpanishLocales({
  br:{comparison:'como-funciona-a-comparacao-de-odds',decimalOdds:'como-ler-odds-decimais',favorites:'favoritos-e-meus-jogos',markets:'mercados-1x2-gols-ambas-marcam',slipComparison:'como-comparar-bilhete'},
  mx:{comparison:'como-funciona-la-comparacion-de-cuotas',decimalOdds:'como-leer-cuotas-decimales',favorites:'favoritos-y-mis-partidos',markets:'mercados-1x2-goles-ambos-marcan',slipComparison:'como-comparar-mi-boleto'},
  en:{comparison:'how-odds-comparison-works',decimalOdds:'how-to-read-decimal-odds',favorites:'favorites-and-my-matches',markets:'football-markets-1x2-goals-btts',slipComparison:'how-to-compare-a-slip'},
} as const);
export const helpPath=(locale:InterfaceLocale,kind:HelpKind)=>`/${locale}/${helpSlugs[locale][kind]}`;
export function helpKind(locale:InterfaceLocale,slug:string){return helpKinds.find(k=>helpSlugs[locale][k]===slug)??null;}
