import {describe,expect,it} from 'vitest';
import {slipSharePayload} from './share-card';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {buildSlipComparison} from './comparison';
import {resolveSelection} from './resolution';
describe('shareable slip card payload',()=>{
  it.each([['mx','MX$'],['co','COP$'],['pe','S/']] as const)('keeps %s currency even when the shared card is in English', (currencyLocale,symbol)=>{
    const f=comparisonFixture(),comparison=buildSlipComparison(f.selections,currencyLocale,f.data.fixtures,f.data.bookmakers,f.now);
    const resolved=f.selections.map(s=>resolveSelection(s,f.data.fixtures.get(s.fixturePublicId)??null,f.now));
    const payload=slipSharePayload({locale:'en',currencyLocale,slipId:'synthetic',stake:'10',generatedAt:new Date(f.now).toISOString(),selections:f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()})),resolved,comparison});
    expect(payload.stake).toContain(symbol);expect(payload.bestReturn).toContain(symbol);expect(payload.returnLabel).toBe('Estimated potential return');
    expect(payload.stake).not.toContain('USD');expect(payload.stake).not.toContain('R$');
  });
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
  it('shares no total at all for a bookmaker that did not price every leg',()=>{
    // There is no "estimated" shared total any more: a combined price is only ever that bookmaker's own.
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const resolved=f.selections.map(s=>resolveSelection(s,f.data.fixtures.get(s.fixturePublicId)??null,f.now));
    const payload=slipSharePayload({locale:'br',slipId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',stake:'10',generatedAt:new Date(f.now).toISOString(),selections:f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()})),resolved,comparison});
    expect(payload.bookmakers.some(b=>b.estimated)).toBe(false);
    const incomplete=payload.bookmakers.find(b=>!b.complete)!;
    expect(incomplete.incompleteLabel).not.toBe('');
    expect(incomplete.missing.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toContain('NaN');
    // The book that priced everything still shares its own total, with nothing missing. The rounding
    // mark on a displayed combined price is unrelated to provenance.
    const complete=payload.bookmakers.find(b=>b.complete)!;
    expect(complete.combined).toBeTruthy();
    expect(complete.missing).toEqual([]);
    expect(complete.incompleteLabel).toBe('');
  });
});
