import {describe,it,expect} from 'vitest';
import {legalContent} from './legal-content';
describe('V2 truthful product and commercial terms',()=>{
 it.each(['mx','co','pe','br','en'] as const)('distinguishes manual calculations, preserved history and inactive campaigns in %s',locale=>{
  const terms=JSON.stringify(legalContent[locale].terms),disclosure=JSON.stringify(legalContent[locale].disclosure);
  expect(terms).toMatch(/educational|educativos|educativas/);expect(terms).toMatch(/calculator|calculadora/);expect(terms).toMatch(/not bookmaker quotes|no cotizaciones|não cotações/);
  expect(terms).toMatch(/no longer|ya no|não fazem mais/);expect(terms).not.toContain('0.90');
  expect(disclosure).toMatch(/inactive|inactivos|inativos/);expect(disclosure).toMatch(/Mexico|México/);expect(disclosure).toMatch(/Peru|Perú/);
  expect(disclosure).toMatch(/Disabled|desactivados|desativados/);
 });
});
