import { describe, expect, it } from 'vitest';
import { parseProfileParam, playerPath, slugifyProfileName, teamPath } from './routes';

describe('profile canonical routes', () => {
  it('keeps canonical identity stable while localizing readable segments', () => {
    const id='0123456789abcdef';
    expect(teamPath('br',id,'São Paulo FC')).toBe('/br/time/sao-paulo-fc-0123456789abcdef');
    expect(teamPath('mx',id,'São Paulo FC')).toBe('/mx/equipo/sao-paulo-fc-0123456789abcdef');
    expect(teamPath('co',id,'São Paulo FC')).toBe('/co/equipo/sao-paulo-fc-0123456789abcdef');
    expect(teamPath('pe',id,'São Paulo FC')).toBe('/pe/equipo/sao-paulo-fc-0123456789abcdef');
    expect(playerPath('br',id,'Giorgian de Arrascaeta')).toBe('/br/jogador/giorgian-de-arrascaeta-0123456789abcdef');
    expect(playerPath('mx',id,'Giorgian de Arrascaeta')).toBe('/mx/jugador/giorgian-de-arrascaeta-0123456789abcdef');
    expect(playerPath('co',id,'Giorgian de Arrascaeta')).toBe('/co/jugador/giorgian-de-arrascaeta-0123456789abcdef');
    expect(playerPath('pe',id,'Giorgian de Arrascaeta')).toBe('/pe/jugador/giorgian-de-arrascaeta-0123456789abcdef');
  });

  it('parses only a 16-character LivaSports ID and keeps same-name entities distinct', () => {
    expect(parseProfileParam('america-0123456789abcdef')).toEqual({slug:'america',publicId:'0123456789abcdef'});
    expect(parseProfileParam('america-1234')).toBeNull();
    expect(playerPath('br','aaaaaaaaaaaaaaaa','Alex Silva')).not.toBe(playerPath('br','bbbbbbbbbbbbbbbb','Alex Silva'));
  });

  it('normalizes accented and long names without coupling identity to the slug', () => {
    expect(slugifyProfileName('  Associação Atlética Ponte Preta  ')).toBe('associacao-atletica-ponte-preta');
    expect(teamPath('br','0123456789abcdef','Nome antigo').split('-').at(-1)).toBe('0123456789abcdef');
    expect(teamPath('br','0123456789abcdef','Nome novo').split('-').at(-1)).toBe('0123456789abcdef');
  });
});
