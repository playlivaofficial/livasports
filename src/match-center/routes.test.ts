import { describe, expect, it } from 'vitest';
import { matchPath, parseMatchParam, slugifyMatch } from './routes';

describe('Match Center public routes', () => {
  it('uses a LivaSports public identity and localized route segment', () => {
    expect(matchPath('br','0123456789abcdef','São Paulo','Grêmio')).toBe('/br/jogo/sao-paulo-x-gremio-0123456789abcdef');
    expect(matchPath('mx','0123456789abcdef','São Paulo','Grêmio')).toBe('/mx/partido/sao-paulo-x-gremio-0123456789abcdef');
  });
  it('parses only the persisted 16-character public ID suffix', () => {
    expect(parseMatchParam('a-x-b-0123456789abcdef')).toEqual({slug:'a-x-b',publicId:'0123456789abcdef'});
    expect(parseMatchParam('a-x-b-123')).toBeNull();
  });
  it('keeps repeated pairings readable while identity remains distinct', () => {
    expect(slugifyMatch('A','B')).toBe(slugifyMatch('A','B'));
    expect(matchPath('br','aaaaaaaaaaaaaaaa','A','B')).not.toBe(matchPath('br','bbbbbbbbbbbbbbbb','A','B'));
  });
});
