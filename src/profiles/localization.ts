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
    england: 'Inglaterra', france: 'França', germany: 'Alemanha', italy: 'Itália', mexico: 'México', netherlands: 'Países Baixos',
    paraguay: 'Paraguai', portugal: 'Portugal', saudiarabia: 'Arábia Saudita', spain: 'Espanha', turkey: 'Turquia',
    unitedstates: 'Estados Unidos', unitedstatesofamerica: 'Estados Unidos', uruguay: 'Uruguai', venezuela: 'Venezuela',
  },
  mx: {
    argentina: 'Argentina', brazil: 'Brasil', brasil: 'Brasil', chile: 'Chile', colombia: 'Colombia', ecuador: 'Ecuador',
    england: 'Inglaterra', france: 'Francia', germany: 'Alemania', italy: 'Italia', mexico: 'México', netherlands: 'Países Bajos',
    paraguay: 'Paraguay', portugal: 'Portugal', saudiarabia: 'Arabia Saudita', spain: 'España', turkey: 'Turquía',
    unitedstates: 'Estados Unidos', unitedstatesofamerica: 'Estados Unidos', uruguay: 'Uruguay', venezuela: 'Venezuela',
  },
};

function positionKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

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
  return countryLabels[locale][positionKey(value)] ?? value;
}
