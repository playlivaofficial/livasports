import {describe,it,expect} from 'vitest';
import {resolveInsurance,type InsuranceCandidate} from './insurance';
import {BOOKMAKER_REGISTRY,VISIBLE_BOOKMAKERS} from './registry';
const candidate=(bookmaker:string,decimalOdds='2.10',overrides:Partial<InsuranceCandidate<string>>={}):InsuranceCandidate<string>=>({bookmaker,decimalOdds,current:true,priceKind:'REAL',value:bookmaker,...overrides});

/**
 * After the MX/CO/PE cutover no operator holds the HIDDEN_INSURANCE role: Betano was Brazil's
 * preferred source and is now unpurchasable. The resolver keeps the branch, so these tests pin the
 * dormant state and the alternate path that remains reachable. Production sets insuranceEnabled
 * false on both read paths, so none of this is live today either way.
 *
 * The resolver is GEO-agnostic and its inputs arrive pre-scoped, so the candidate sets below exercise
 * ordering mechanics only. Real per-GEO eligibility is asserted in geo-comparison.test.ts.
 */
describe('exact-selection native insurance resolver',()=>{
  it('has no preferred insurance source configured any more',()=>{
    expect(BOOKMAKER_REGISTRY.some(b=>b.displayRole==='HIDDEN_INSURANCE')).toBe(false);
    // The BETANO_INSURANCE_USED branch is therefore unreachable, and nothing reports a failed preference.
    const result=resolveInsurance('betsson',[candidate('bwin')]);
    expect(result.resolution).not.toBe('BETANO_INSURANCE_USED');
    expect(result.preferredInsuranceFailed).toBe(false);
  });

  it('own REAL wins immediately',()=>{
    expect(resolveInsurance('betsson',[candidate('bwin'),candidate('betsson','2.22')]).resolution).toBe('OWN_REAL');
    expect(resolveInsurance('betsson',[candidate('bwin'),candidate('betsson','2.22')]).candidate?.bookmaker).toBe('betsson');
  });

  it('accepts one real visible alternate',()=>{
    // Colombia is the only jurisdiction with two books, so Betsson/bwin is the real alternate pair.
    const result=resolveInsurance('betsson',[candidate('bwin')]);
    expect(result.resolution).toBe('ALTERNATE_INSURANCE_USED');
    expect(result.candidate?.bookmaker).toBe('bwin');
  });

  it('selects the lowest healthy visible alternate deterministically',()=>{
    const sources=[candidate('bwin','2.18'),candidate('inkabet','2.05')];
    expect(resolveInsurance('betsson',sources).candidate?.bookmaker).toBe('inkabet');
    // Stable across repeated resolution: ordering is configured, never random.
    expect(resolveInsurance('betsson',[...sources].reverse()).candidate?.bookmaker).toBe('inkabet');
  });

  it('breaks decimal ties on configured priority, not input order',()=>{
    expect(resolveInsurance('betsson',[candidate('inkabet','2.100'),candidate('bwin','2.1')]).candidate?.bookmaker).toBe('bwin');
    expect(resolveInsurance('betsson',[candidate('bwin','2.1'),candidate('inkabet','2.100')]).candidate?.bookmaker).toBe('bwin');
    // bwin outranks Inkabet because insurancePriority is configured, and it is strictly ordered.
    const priorities=VISIBLE_BOOKMAKERS.map(b=>b.insurancePriority);
    expect(priorities).toEqual([...priorities].sort((a,b)=>a-b));
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('fails closed when all sources are missing',()=>expect(resolveInsurance('betsson',[]).resolution).toBe('NO_INSURANCE_AVAILABLE'));

  it('never chains proxies or consumes expired/invalid quotes',()=>
    expect(resolveInsurance('betsson',[candidate('bwin','2',{current:false}),candidate('inkabet','2',{priceKind:'PROXY'}),candidate('bwin','NaN')]).candidate).toBeNull());

  it('rejects unknown sources even with a valid price',()=>expect(resolveInsurance('betsson',[candidate('unknown')]).candidate).toBeNull());

  it('rejects retired operators as sources, including for their own row',()=>{
    for(const retired of ['sportingbet.bet.br','betano.bet.br','betboo.bet.br']){
      expect(resolveInsurance('betsson',[candidate(retired)]).candidate).toBeNull();
      expect(resolveInsurance(retired,[candidate(retired)]).candidate).toBeNull();
    }
  });
});
