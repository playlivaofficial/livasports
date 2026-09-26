import {SOURCE_BOOKMAKER_IDS} from './registry';
export const CANONICAL_BOOKMAKERS = SOURCE_BOOKMAKER_IDS;
export type CanonicalBookmaker = typeof CANONICAL_BOOKMAKERS[number];
export type BookmakerParityKey = 'betano' | 'betsson';

const ALIASES: Record<string, CanonicalBookmaker> = {
  'sportingbet.bet.br':'sportingbet.bet.br',
  'betboo.bet.br':'betboo.bet.br',
  'betano.bet.br': 'betano.bet.br',
  betano: 'betano.bet.br',
  'betano.br': 'betano.bet.br',
  'www.betano.bet.br': 'betano.bet.br',
  betsson: 'betsson',
  'betsson.com': 'betsson',
  'www.betsson.com': 'betsson',
  'betsson.bet.br': 'betsson',
  'www.betsson.bet.br': 'betsson',
  '1xbet': '1xbet',
  '1xbet.com': '1xbet',
  'www.1xbet.com': '1xbet',
  '1xbet.bet.br': '1xbet',
  'www.1xbet.bet.br': '1xbet',
};

export function canonicalBookmakerSlug(value: unknown): CanonicalBookmaker | null {
  if (typeof value !== 'string') return null;
  return ALIASES[value.trim().toLowerCase()] ?? null;
}

export function bookmakerParityKey(value: unknown): BookmakerParityKey | null {
  const slug = canonicalBookmakerSlug(value);
  if (slug === 'betano.bet.br') return 'betano';
  if (slug === 'betsson') return 'betsson';
  return null;
}
