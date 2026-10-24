import type { InterfaceLocale } from '@/localization/interface';

// Only known generated headings are translated. Never run this over participant names or stored source data.
const labels: Record<string, readonly [string, string]> = {
  'Apertura — community-maintained standings': ['Apertura — tabla mantenida por la comunidad', 'Apertura — tabela mantida pela comunidade'],
  'Regular season': ['Temporada regular', 'Temporada regular'],
  'Completed regular season': ['Temporada regular finalizada', 'Temporada regular concluída'],
  'Regular season — source standings points exclude overtime': ['Temporada regular — los puntos de la fuente excluyen la prórroga', 'Temporada regular — os pontos da fonte excluem a prorrogação'],
  'American League': ['Liga Americana', 'Liga Americana'], 'National League': ['Liga Nacional', 'Liga Nacional'],
  East: ['Este', 'Leste'], North: ['Norte', 'Norte'], South: ['Sur', 'Sul'], West: ['Oeste', 'Oeste'], Central: ['Central', 'Central'],
  Eastern: ['Este', 'Leste'], Western: ['Oeste', 'Oeste'], Atlantic: ['Atlántico', 'Atlântico'], Metropolitan: ['Metropolitana', 'Metropolitana'], Pacific: ['Pacífico', 'Pacífico'],
  Southeast: ['Sureste', 'Sudeste'], Southwest: ['Suroeste', 'Sudoeste'], Northwest: ['Noroeste', 'Noroeste'],
};
export function tableLabel(value: string, locale: InterfaceLocale): string {
  if (locale === 'en') return value;
  const index = locale === 'br' ? 1 : 0;
  if (Object.hasOwn(labels, value)) return labels[value][index];
  const division = /^(AFC|NFC|AL|NL) (East|North|South|West|Central)$/.exec(value);
  if (division) return `${division[1]} ${labels[division[2]][index]}`;
  const hockey = /^(Atlantic|Metropolitan|Central|Pacific) Division(?: — (\d{4}-\d{2}-\d{2}))?$/.exec(value);
  if (hockey) return `${locale === 'br' ? 'Divisão' : 'División'} ${labels[hockey[1]][index]}${hockey[2] ? ' — '+hockey[2] : ''}`;
  const tennis = /^(ATP|WTA) singles rankings — published top 20$/.exec(value);
  if (tennis) return locale === 'br' ? `${tennis[1]} — ranking de simples: 20 primeiros publicados` : `${tennis[1]} — ranking individual: 20 primeros publicados`;
  return value;
}
