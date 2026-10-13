import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CalculatedPrice,EstimateDisclaimer} from './CalculatedPrice';
import type {CalculatedOddsEstimate} from '@/odds/types';
const estimate:CalculatedOddsEstimate={kind:'CALCULATED_MINUS_10',fixtureId:'f',market:'BTTS',outcome:'YES',line:null,scope:'FULL_TIME_REGULATION',targetBookmaker:'bwin',sourceBookmaker:'betsson',sourceBookmakerName:'Betsson',sourceDecimalOdds:'2.5',decimalOdds:'2.25',multiplier:'0.90',sourceObservedAt:'2026-10-13T11:00:00Z',expiresAt:'2026-10-13T11:20:00Z',executable:false,affiliateEligible:false};
describe('clearly labeled non-executable calculated cell',()=>{
 it.each(['mx','co','pe','br','en'] as const)('renders accessible visible distinction in %s without selection/affiliate interaction',locale=>{
  const html=renderToStaticMarkup(<><CalculatedPrice estimate={estimate} locale={locale}/><EstimateDisclaimer locale={locale} source="Betsson"/></>);
  expect(html).toContain(locale==='co'||locale==='br'?'2,25':'2.25');expect(html).toContain('Betsson');expect(html).toContain('−10%');expect(html).toContain('odds-approx-mark');
  expect(html).toContain('data-price-kind="CALCULATED_MINUS_10"');
  expect(html).not.toMatch(/<button|<a\s|data-target-bookmaker|data-price-kind="REAL"/);
  if(['mx','co','pe'].includes(locale))expect(html).toContain('Estimación −10% · No es una cuota ofrecida por esta casa');
 });
 it('does not hide the mathematical below-one edge case',()=>{
  expect(renderToStaticMarkup(<CalculatedPrice estimate={{...estimate,sourceDecimalOdds:'1.05',decimalOdds:'0.945'}} locale="en"/>)).toContain('not valid bookmaker odds');
 });
});
