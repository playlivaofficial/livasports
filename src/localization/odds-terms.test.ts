import {describe,it,expect} from 'vitest';
import {legalContent} from './legal-content';

describe('odds display terms',()=>{
  it.each(['mx','co','pe','br','en'] as const)('explains approximate non-executable comparisons in %s',locale=>{
    const sections=legalContent[locale].terms.sections;
    const body=sections.find(s=>s.body.includes('≈'))?.body??'';
    expect(body).toMatch(/0[,.]90/);
    expect(body).toMatch(/no una cuota ofrecida|não uma cotação oferecida|not a price offered/);
    expect(body).toMatch(/se pueden seleccionar|podem ser selecionadas|can be selected/);
    expect(body).toMatch(/no son cuotas ejecutables|não são cotações executáveis|not executable quotes/);
    expect(body).toMatch(/retornos potenciales|retornos potenciais|potential returns/);
  });
});
