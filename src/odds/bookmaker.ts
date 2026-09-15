export const CANONICAL_BOOKMAKERS = ['betano.bet.br', 'betsson'] as const;
export type CanonicalBookmaker = typeof CANONICAL_BOOKMAKERS[number];
export type BookmakerParityKey = 'betano' | 'betsson';

const ALIASES: Record<string, CanonicalBookmaker> = {
  'betano.bet.br': 'betano.bet.br',
  betano: 'betano.bet.br',
  'betano.br': 'betano.bet.br',
  'www.betano.bet.br': 'betano.bet.br',
  betsson: 'betsson',
  'betsson.com': 'betsson',
  'www.betsson.com': 'betsson',
  'betsson.bet.br': 'betsson',
  'www.betsson.bet.br': 'betsson',
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
