import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CalculatedPrice} from './CalculatedPrice';
import {ApproximatePrice} from './ApproximatePrice';
import {load} from 'cheerio';
import type {CalculatedOddsEstimate} from '@/odds/types';
const estimate:CalculatedOddsEstimate={kind:'CALCULATED_MINUS_10',fixtureId:'f',market:'BTTS',outcome:'YES',line:null,scope:'FULL_TIME_REGULATION',targetBookmaker:'bwin',sourceBookmaker:'betsson',sourceBookmakerName:'Betsson',sourceDecimalOdds:'2.5',decimalOdds:'2.25',multiplier:'0.90',sourceObservedAt:'2026-10-13T11:00:00Z',expiresAt:'2026-10-13T11:20:00Z',executable:false,affiliateEligible:false};
describe('clearly labeled non-executable calculated cell',()=>{
 it.each(['mx','co','pe','br','en'] as const)('renders accessible visible distinction in %s without selection/affiliate interaction',locale=>{
  const html=renderToStaticMarkup(<CalculatedPrice estimate={estimate} locale={locale}/>);
  expect(html).toContain(locale==='co'||locale==='br'?'2,25':'2.25');expect(html).toContain('Betsson');expect(html).toContain('−10%');expect(html).toContain('odds-approx-mark');
  expect(html).toContain('data-price-kind="CALCULATED_MINUS_10"');
  expect(html).not.toMatch(/<button|<a\s|data-target-bookmaker|data-price-kind="REAL"/);
  if(['mx','co','pe'].includes(locale))expect(html).toContain('No es una cuota ofrecida por esta casa');
  const $=load(html);$('.sr-only').remove();
  expect($('body').text()).toBe(locale==='co'||locale==='br'?'≈2,25':'≈2.25');
  expect($('small,p,button,a')).toHaveLength(0);
 });
 it('does not hide the mathematical below-one edge case',()=>{
  expect(renderToStaticMarkup(<CalculatedPrice estimate={{...estimate,sourceDecimalOdds:'1.05',decimalOdds:'0.945'}} locale="en"/>)).toContain('not valid bookmaker odds');
 });
 it('renders a genuine price without an approximation or a visible label',()=>{
  const html=renderToStaticMarkup(<ApproximatePrice approximate={false} value="1.57" label="Real bookmaker quote"/>);
  expect(html).not.toContain('odds-approx-mark');const $=load(html);$('.sr-only').remove();expect($('body').text()).toBe('1.57');
 });
});
