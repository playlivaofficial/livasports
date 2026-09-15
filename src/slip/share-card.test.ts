import {describe,expect,it} from 'vitest';
import {slipSharePayload} from './share-card';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {buildSlipComparison} from './comparison';
import {resolveSelection} from './resolution';
describe('shareable slip card payload',()=>{
  it('summarizes the exact same-slip comparison without looking like a bookmaker receipt',()=>{
    const f=comparisonFixture();
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const resolved=f.selections.map(s=>resolveSelection(s,f.data.fixtures.get(s.fixturePublicId)??null,f.now));
    const payload=slipSharePayload({locale:'br',slipId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',stake:'10',generatedAt:new Date(f.now).toISOString(),selections:f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()})),resolved,comparison});
    expect(payload.legs).toHaveLength(3);expect(payload.bestCombined).toBe('≈6,46');expect(payload.bestReturn).toContain('64,60');
    expect(payload.legs.every(leg=>leg.odds.startsWith('≈'))).toBe(true);expect(payload.bookmakers.every(book=>book.combined?.startsWith('≈'))).toBe(true);
    expect(payload.returnLabel).toBe('Retorno potencial estimado');
    expect(payload.notAReceipt).toMatch(/não é um comprovante oficial/i);expect(payload.responsible).toBe('18+');
    expect(JSON.stringify(payload)).not.toMatch(/\/go\/|partner=|guaranteed|profit|Place bet/);
    expect(JSON.stringify(payload)).not.toMatch(/>\s*\?\s*|NaN|"—"/);
  });
  it('labels proxy-based shared totals as estimates',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const resolved=f.selections.map(s=>resolveSelection(s,f.data.fixtures.get(s.fixturePublicId)??null,f.now));
    const payload=slipSharePayload({locale:'br',slipId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',stake:'10',generatedAt:new Date(f.now).toISOString(),selections:f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()})),resolved,comparison});
    const estimated=payload.bookmakers.find(b=>b.estimated)!;
    expect(estimated.complete).toBe(true);expect(estimated.combined).toMatch(/^≈/);expect(estimated.potentialReturn).not.toMatch(/^[~≈]/);
    expect(estimated.incompleteLabel).toBe('');expect(estimated.missing).toEqual([]);
    expect(JSON.stringify({combined:estimated.combined,potentialReturn:estimated.potentialReturn})).not.toContain('NaN');
  });
});
