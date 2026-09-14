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
    expect(payload.legs).toHaveLength(3);expect(payload.bestCombined).toBe('6,46');expect(payload.bestReturn).toContain('64,60');
    expect(payload.notAReceipt).toMatch(/não é um comprovante oficial/i);expect(payload.responsible).toBe('18+');
    expect(JSON.stringify(payload)).not.toMatch(/\/go\/|partner=|guaranteed|profit|Place bet/);
    expect(JSON.stringify(payload)).not.toMatch(/>\s*\?\s*|NaN|"—"/);
  });
  it('names incomplete books instead of leaving a blank or placeholder total',()=>{
    const f=comparisonFixture();f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes.pop();
    const comparison=buildSlipComparison(f.selections,'br',f.data.fixtures,f.data.bookmakers,f.now);
    const resolved=f.selections.map(s=>resolveSelection(s,f.data.fixtures.get(s.fixturePublicId)??null,f.now));
    const payload=slipSharePayload({locale:'br',slipId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',stake:'10',generatedAt:new Date(f.now).toISOString(),selections:f.selections.map(s=>({...s,addedAt:new Date(f.now).toISOString()})),resolved,comparison});
    const incomplete=payload.bookmakers.find(b=>!b.complete)!;
    expect(incomplete.combined).toBeNull();expect(incomplete.potentialReturn).toBeNull();
    expect(incomplete.incompleteLabel).toBe('Indisponível para este cupom completo');
    expect(incomplete.missing.length).toBeGreaterThan(0);
    expect(incomplete.combined).not.toBe('?');expect(incomplete.potentialReturn).not.toBe('?');
    expect(JSON.stringify({combined:incomplete.combined,potentialReturn:incomplete.potentialReturn})).not.toContain('NaN');
  });
});
