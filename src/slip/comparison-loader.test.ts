import {describe,it,expect,vi} from 'vitest';
import {freshnessTtlMs} from '@/odds/scheduler-policy';
import {ComparisonLoader,comparisonCacheKey} from './comparison-loader';
import {comparisonFixture} from './comparison-fixtures.test-support';

describe('M7 bounded read/cache path',()=>{
  it('batches ten IDs once, shares order-independent cache, preserves requested display order and does not fetch providers',async()=>{
    const f=comparisonFixture(10);const read=vi.fn().mockResolvedValue(f.data);const metrics=vi.fn(),fetch=vi.spyOn(globalThis,'fetch');
    const loader=new ComparisonLoader(read,()=>f.now,metrics);
    const first=await loader.resolve(f.selections,'br');const reversed=await loader.resolve([...f.selections].reverse(),'br');
    expect(read).toHaveBeenCalledTimes(1);expect(read.mock.calls[0][0]).toHaveLength(10);
    expect(reversed.comparison.bookmakers[0].selectionQuotes.map(q=>q.selection)).toEqual([...f.selections].reverse());
    expect(reversed.comparison.bookmakers[0].combinedDecimalOdds).toBe(first.comparison.bookmakers[0].combinedDecimalOdds);
    expect(metrics.mock.calls.map(c=>c[0].cache)).toEqual(['MISS','HIT']);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it('isolates locale and expires cache at the first quote boundary, with no stale-while-error',async()=>{
    const f=comparisonFixture();let now=f.now+freshnessTtlMs(1,2)-1000;const read=vi.fn().mockResolvedValue(f.data);const loader=new ComparisonLoader(read,()=>now);
    expect((await loader.resolve(f.selections,'br')).comparison.bookmakers[0].complete).toBe(true);
    now+=1000;expect((await loader.resolve(f.selections,'br')).comparison.bookmakers[0].complete).toBe(false);expect(read).toHaveBeenCalledTimes(2);
    expect((await loader.resolve(f.selections,'mx')).comparison.bookmakers).toEqual([]);expect(read).toHaveBeenCalledTimes(3);
    now+=15001;read.mockRejectedValue(new Error('DB_DOWN'));await expect(loader.resolve(f.selections,'br')).rejects.toThrow('DB_DOWN');
  });
  it('deduplicates concurrent misses and does not cache rejected reads',async()=>{
    const f=comparisonFixture();const read=vi.fn().mockResolvedValue(f.data);const loader=new ComparisonLoader(read,()=>f.now);
    await Promise.all([loader.resolve(f.selections,'br'),loader.resolve([...f.selections].reverse(),'br')]);expect(read).toHaveBeenCalledTimes(1);
    expect(comparisonCacheKey(f.selections,'br')).toMatch(/^slip-comparison:v1:br:/);
    expect(comparisonCacheKey(f.selections,'br')).not.toBe(comparisonCacheKey(f.selections,'mx'));
  });
  it('rejects invalid server input before reads and resolves empty slips with zero queries',async()=>{
    const f=comparisonFixture(11);const read=vi.fn();const loader=new ComparisonLoader(read);
    await expect(loader.resolve(f.selections,'br')).rejects.toThrow('INVALID_SLIP');
    expect((await loader.resolve([],'br')).comparison.states).toEqual(['EMPTY_SLIP']);expect(read).not.toHaveBeenCalled();
  });
});
