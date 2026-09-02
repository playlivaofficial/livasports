import { describe, expect, it } from 'vitest';
import { sanitizeQuery, sanitizeText } from './safe-error';

describe('safe provider diagnostics', () => {
  it('redacts secret query values while retaining useful provider parameters', () => {
    const query = new URLSearchParams({ apiKey: 'secret-value', tournamentIds: '325,373', bookmaker: 'betsson' });
    expect(sanitizeQuery(query)).toEqual({
      apiKey: '[REDACTED]', tournamentIds: '325,373', bookmaker: 'betsson',
    });
    expect(sanitizeText('provider echoed secret-value', ['secret-value'])).toBe('provider echoed [REDACTED]');
  });
});
