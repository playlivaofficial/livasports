import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlipComparison} from './SlipComparison';
import {buildSlipComparison} from '@/slip/comparison';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
describe('M7 semantic localized comparison cards',()=>{
  it('renders exact totals, meaningful sponsored CTA and independent best text',()=>{
    const f=comparisonFixture();const html=renderToStaticMarkup(<SlipComparison locale="br" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('6,05');expect(html).toContain('6,46');expect(html).toContain('Melhor odd combinada entre as casas comparadas');expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
    expect(html).toContain('Ver odds · Betsson');expect(html).not.toContain('Ver odds · Betano');expect(html).not.toContain('partner=test-only');expect(html).not.toMatch(/stake|payout|Open slip|Send slip/);
  });
  it('makes exact missing selections keyboard-accessible with native details',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const html=renderToStaticMarkup(<SlipComparison locale="br" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('<details');expect(html).toContain('Real Madrid');expect(html).toContain('Seleções indisponíveis (1)');expect(html).not.toContain('Melhor odd combinada');
  });
  it('renders a natural Spanish state without inherited BR pricing',()=>{
    const f=comparisonFixture();const html=renderToStaticMarkup(<SlipComparison locale="mx" selections={f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()}))} checking={false} value={buildSlipComparison(f.selections,'mx',f.data.fixtures,f.data.bookmakers,f.now)}/>);
    expect(html).toContain('No hay casas verificadas');expect(html).not.toContain('slip-combined');expect(html).not.toContain('Betano');
  });
});
