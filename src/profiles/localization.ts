import type { SiteLocale } from '@/config/i18n';

const positionLabels: Record<SiteLocale, Record<string, string>> = {
  br: {
    goalkeeper: 'Goleiro', keeper: 'Goleiro', defender: 'Defensor', centreback: 'Zagueiro', centerback: 'Zagueiro',
    leftback: 'Lateral-esquerdo', rightback: 'Lateral-direito', wingback: 'Ala', midfielder: 'Meio-campista',
    defensivemidfield: 'Volante', centralmidfield: 'Meio-campista central', attackingmidfield: 'Meia ofensivo',
    leftmidfield: 'Meio-campista pela esquerda', rightmidfield: 'Meio-campista pela direita', attacker: 'Atacante',
    forward: 'Atacante', centreforward: 'Centroavante', centerforward: 'Centroavante', striker: 'Centroavante',
    leftwing: 'Ponta-esquerda', rightwing: 'Ponta-direita', winger: 'Ponta',
  },
  mx: {
    goalkeeper: 'Portero', keeper: 'Portero', defender: 'Defensa', centreback: 'Defensa central', centerback: 'Defensa central',
    leftback: 'Lateral izquierdo', rightback: 'Lateral derecho', wingback: 'Carrilero', midfielder: 'Mediocampista',
    defensivemidfield: 'Mediocampista defensivo', centralmidfield: 'Mediocampista central', attackingmidfield: 'Mediocampista ofensivo',
    leftmidfield: 'Mediocampista por izquierda', rightmidfield: 'Mediocampista por derecha', attacker: 'Delantero',
    forward: 'Delantero', centreforward: 'Delantero centro', centerforward: 'Delantero centro', striker: 'Delantero centro',
    leftwing: 'Extremo izquierdo', rightwing: 'Extremo derecho', winger: 'Extremo',
  },
};

const countryLabels: Record<SiteLocale, Record<string, string>> = {
  br: {
    argentina: 'Argentina', brazil: 'Brasil', brasil: 'Brasil', chile: 'Chile', colombia: 'Colômbia', ecuador: 'Equador',
    europe:'Europa',world:'Mundo',international:'Internacional',southamerica:'América do Sul',northamerica:'América do Norte',asia:'Ásia',africa:'África',oceania:'Oceania',scotland:'Escócia',wales:'País de Gales',northernireland:'Irlanda do Norte',
    england: 'Inglaterra', france: 'França', germany: 'Alemanha', italy: 'Itália', mexico: 'México', netherlands: 'Países Baixos',
    paraguay: 'Paraguai', portugal: 'Portugal', saudiarabia: 'Arábia Saudita', spain: 'Espanha', turkey: 'Turquia',
    unitedstates: 'Estados Unidos', unitedstatesofamerica: 'Estados Unidos', uruguay: 'Uruguai', venezuela: 'Venezuela',
  },
  mx: {
    argentina: 'Argentina', brazil: 'Brasil', brasil: 'Brasil', chile: 'Chile', colombia: 'Colombia', ecuador: 'Ecuador',
    europe:'Europa',world:'Mundo',international:'Internacional',southamerica:'América del Sur',northamerica:'América del Norte',asia:'Asia',africa:'África',oceania:'Oceanía',scotland:'Escocia',wales:'Gales',northernireland:'Irlanda del Norte',
    england: 'Inglaterra', france: 'Francia', germany: 'Alemania', italy: 'Italia', mexico: 'México', netherlands: 'Países Bajos',
    paraguay: 'Paraguay', portugal: 'Portugal', saudiarabia: 'Arabia Saudita', spain: 'España', turkey: 'Turquía',
    unitedstates: 'Estados Unidos', unitedstatesofamerica: 'Estados Unidos', uruguay: 'Uruguay', venezuela: 'Venezuela',
  },
};

function positionKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

const countryCodes=new Map<string,string>();
const englishCountries=new Intl.DisplayNames(['en'],{type:'region',fallback:'none'});
for(const first of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')for(const second of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
  const code=first+second,name=englishCountries.of(code);if(name)countryCodes.set(positionKey(name),code);
}
for(const [name,code] of Object.entries({korearepublic:'KR',republicofireland:'IE',congodr:'CD',drcongo:'CD',democraticrepublicofthecongo:'CD',czechrepublic:'CZ',ivorycoast:'CI',capeverde:'CV',russianfederation:'RU',republicofnorthmacedonia:'MK',
  antiguaandbarbuda:'AG',bosniaandherzegovina:'BA',koreadpr:'KP',kyrgyzrepublic:'KG',palestine:'PS',republicofthecongo:'CG',saintkittsandnevis:'KN',saintlucia:'LC',saintvincentandthegrenadines:'VC',saotomeandprincipe:'ST',trinidadandtobago:'TT',
}))countryCodes.set(name,code);
const displayCountries={br:new Intl.DisplayNames(['pt-BR'],{type:'region',fallback:'none'}),mx:new Intl.DisplayNames(['es-MX'],{type:'region',fallback:'none'})};

export function localizedPosition(locale: SiteLocale, ...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const exact = positionLabels[locale][positionKey(candidate)];
    if (exact) return exact;
  }
  return null;
}

export function localizedCountry(locale: SiteLocale, value: string | null | undefined): string | null {
  if (!value) return null;
  const key=positionKey(value),code=countryCodes.get(key);
  return countryLabels[locale][key] ?? (code?displayCountries[locale].of(code):null) ?? value;
}
