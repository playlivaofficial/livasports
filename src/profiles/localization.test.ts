import { describe, expect, it } from 'vitest';
import { localizedCountry, localizedPosition } from './localization';

describe('profile position localization', () => {
  it('uses native broad-position labels in both locales', () => {
    expect(localizedPosition('br', 'Goalkeeper')).toBe('Goleiro');
    expect(localizedPosition('br', 'Defender')).toBe('Defensor');
    expect(localizedPosition('mx', 'Midfielder')).toBe('Mediocampista');
    expect(localizedPosition('mx', 'Attacker')).toBe('Delantero');
  });

  it('prefers a known detailed position and hides an unknown provider label', () => {
    expect(localizedPosition('br', 'Centre-Back', 'Defender')).toBe('Zagueiro');
    expect(localizedPosition('mx', 'Unknown provider role')).toBeNull();
  });

  it('localizes provider country names without changing unknown proper names', () => {
    expect(localizedCountry('br', 'Brazil')).toBe('Brasil');
    expect(localizedCountry('mx', 'Mexico')).toBe('México');
    expect(localizedCountry('br', 'Cabo Verde')).toBe('Cabo Verde');
  });

  it('resolves historical provider nationality aliases to native country labels',()=>{
    expect(localizedCountry('br','Bosnia and Herzegovina')).toBe('Bósnia e Herzegovina');
    expect(localizedCountry('mx','DR Congo')).toBe('República Democrática del Congo');
    expect(localizedCountry('br','São Tomé and Príncipe')).toBe('São Tomé e Príncipe');
    expect(localizedCountry('mx','Korea DPR')).toBe('Corea del Norte');
    expect(localizedCountry('br','Unidentified source region')).toBe('Unidentified source region');
  });
});
