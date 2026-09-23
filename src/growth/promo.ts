import {BRAND,playLivaLockupSvg} from './brand';
export const PROMO_VARIANTS=['DISCOVER','CONTINUE','EXPLORE'] as const;
export type PromoVariant=typeof PROMO_VARIANTS[number];
const LABELS:Record<PromoVariant,string>={DISCOVER:'CONHEÇA TAMBÉM',CONTINUE:'MAIS DA REDE LIVA',EXPLORE:'EXPLORE TAMBÉM'};
/** Secondary owned-brand placement; no invented product, prize or gambling offer claims. */
export function playLivaPromoSvg(variant:PromoVariant){
  const corners=variant==='DISCOVER'?24:variant==='CONTINUE'?50:8;
  return `<g data-promo="${variant}"><rect x="282" y="1155" width="516" height="98" rx="${corners}" fill="${BRAND.playliva.surface}" fill-opacity=".8"/>`+
    `<text x="540" y="1184" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" letter-spacing="2" fill="${BRAND.playliva.tldInk}">${LABELS[variant]}</text>`+
    playLivaLockupSvg({x:540,y:1205,size:29,anchor:'middle'})+'</g>';
}
