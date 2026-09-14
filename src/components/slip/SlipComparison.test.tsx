import {describe,it,expect,vi} from 'vitest';
vi.mock('@/affiliate/client',async()=>{const {displayOffer}=await import('@/affiliate/fixtures.test-support');return {useCommercialOffer:()=>displayOffer(),privacyOptOut:()=>false,qaBrowser:()=>true};});
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipComparison} from './SlipComparison';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {formatMoney,potentialReturn} from '@/slip/decimal';
describe('M7 semantic localized comparison cards',()=>{
  it('renders exact totals, meaningful sponsored CTA and independent best text',()=>{
    const f=comparisonFixture();const html=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('6,05');expect(html).toContain('6,46');expect(html).toContain('Melhor retorno para este cupom');expect(html).toContain('Retorno potencial');expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
    expect(html).toContain('Ver odds · Betsson');expect(html).not.toContain('Ver odds · Betano');expect(html).not.toContain('partner=test-only');expect(html).not.toMatch(/payout|Open slip|Send slip|guaranteed|profit/);
  });
  it('makes exact missing selections keyboard-accessible with native details',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const html=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('<details');expect(html).toContain('Real Madrid');expect(html).toContain('Falta');expect(html).toContain('Indisponível para este cupom completo');
    expect(html).toContain('vs');expect(html).not.toContain('INVALID_QUOTE');expect(html).not.toMatch(/>\s*\?\s*</);expect(html).not.toContain('NaN');
  });
  it('keeps BR-eligible prices when the interface is Spanish',()=>{
    const f=comparisonFixture();const html=renderToStaticMarkup(<SlipComparison locale="mx" stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'mx',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('Cuota combinada');expect(html).toContain('Mejor retorno para este cupón');
    expect(html).toContain('6.05');expect(html).toContain('6.46');expect(html).not.toContain('Melhor odd');expect(html).not.toContain('No hay casas verificadas');
  });
  it('renders English comparison copy without changing the product math',()=>{
    const f=comparisonFixture();const html=renderToStaticMarkup(<SlipComparison locale="br" uiLocale="en" stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('Best return for this slip');expect(html).toContain('Potential return');    expect(html).toContain('6.05');
  });
  it('recalculates both complete returns when stake changes without rebuilding the slip',()=>{
    const f=comparisonFixture();const value=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const selections=f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}));
    const ten=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={selections} checking={false} value={value}/>);
    const twentyFive=renderToStaticMarkup(<SlipComparison locale="br" stake="25" selections={selections} checking={false} value={value}/>);
    expect(ten).toContain(formatMoney(potentialReturn('10',value.bookmakers[0].combinedDecimalOdds!)!,'br'));
    expect(ten).toContain(formatMoney(potentialReturn('10',value.bookmakers[1].combinedDecimalOdds!)!,'br'));
    expect(twentyFive).toContain(formatMoney(potentialReturn('25',value.bookmakers[0].combinedDecimalOdds!)!,'br'));
    expect(twentyFive).toContain(formatMoney(potentialReturn('25',value.bookmakers[1].combinedDecimalOdds!)!,'br'));
    expect(value.bookmakers.every(b=>b.complete)).toBe(true);
  });
  it('renders 5 complete legs for both books without a placeholder total',()=>{
    const f=comparisonFixture(5);const html=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('data-complete="true"');expect(html).toContain('data-availability="COMPLETE"');
    expect(html).toContain('Odd combinada');expect(html).toContain('Retorno potencial');expect(html).not.toMatch(/>\s*\?\s*</);expect(html).not.toContain('NaN');
  });
  it('names a stale leg without inventing a combined total',()=>{
    const f=comparisonFixture();Object.assign(f.data.fixtures.get(f.selections[0].fixturePublicId)!.snapshot.quotes[1],{status:'STALE'});
    const html=renderToStaticMarkup(<SlipComparison locale="br" stake="20" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('Cota desatualizada');expect(html).toContain('data-availability="STALE_LEG"');expect(html).toContain('data-diagnostic="STALE_QUOTE"');
    expect(html).toContain('Indisponível para este cupom completo');expect(html).not.toMatch(/>\s*\?\s*</);
  });
  it('renders both complete totals at once and names a missing BTTS market',()=>{
    const both=comparisonFixture(3);
    const html=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={both.selections.map(s=>({...s,addedAt:new Date(both.now).toISOString()}))} checking={false} value={buildSlipComparison(both.selections,'br',both.data.fixtures,both.data.bookmakers,both.now)}/>);
    expect(html.match(/data-availability="COMPLETE"/g)?.length).toBe(2);
    expect(html.match(/class="slip-combined"/g)?.length).toBe(2);
    expect(html.match(/class="slip-return"/g)?.length).toBe(2);
    const f=comparisonFixture(1);const home=f.selections[0];const btts={...home,market:'BTTS' as const,outcome:'YES' as const,line:null};
    const missing=renderToStaticMarkup(<SlipComparison locale="br" stake="10" selections={[home,btts].map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison([home,btts],'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(missing).toContain('Mercado indisponível nesta casa');expect(missing).toContain('data-availability="MARKET_UNAVAILABLE"');
    expect(missing).not.toContain('class="slip-combined"');expect(missing).not.toMatch(/>\s*\?\s*</);
  });
});
