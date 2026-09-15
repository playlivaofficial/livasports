import {describe,it,expect} from 'vitest';
import {missingLegReason} from './comparison-copy';

const missing={state:'UNAVAILABLE' as const,reason:'NO_QUOTE' as const,diagnosticCode:'MISSING_QUOTE' as const};
const market={state:'UNAVAILABLE' as const,reason:'NO_QUOTE' as const,diagnosticCode:'MARKET_MISSING' as const};

describe('missing-leg copy',()=>{
  it('names a missing quote at the bookmaker instead of inventing a closed market',()=>{
    expect(missingLegReason(missing,'Betano','en')).toBe('Selection unavailable at Betano');
    expect(missingLegReason(missing,'Betano','br')).toBe('Seleção indisponível na Betano');
    expect(missingLegReason(market,'Betsson','en')).toBe('Market unavailable at Betsson');
  });
  it('maps persisted states without collapsing them into Market closed',()=>{
    expect(missingLegReason({state:'STALE',reason:null,diagnosticCode:'STALE_QUOTE'},'Betano','en')).toBe('Odds outdated');
    expect(missingLegReason({state:'SUSPENDED',reason:null,diagnosticCode:'WITHDRAWN'},'Betano','en')).toBe('Market suspended');
    expect(missingLegReason({state:'UNAVAILABLE',reason:null,diagnosticCode:'WITHDRAWN'},'Betano','en')).toBe('Market withdrawn');
    expect(missingLegReason({state:'MATCH_FINISHED',reason:null,diagnosticCode:'MATCH_FINISHED'},'Betano','en')).toBe('Match finished');
    expect(missingLegReason({state:'CLOSED',reason:null,diagnosticCode:'WITHDRAWN'},'Betano','en')).toBe('Market closed');
  });
});
