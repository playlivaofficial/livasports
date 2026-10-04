/** One Spanish vocabulary, with country-specific product data supplied separately. */
export function withSpanishLocales<T extends {mx:unknown}>(base:T):T & {co:T['mx'];pe:T['mx']} {
  return {...base,co:base.mx,pe:base.mx};
}
export const isSpanishLocale=(locale:string)=>locale==='mx'||locale==='co'||locale==='pe';
