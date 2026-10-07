import {describe,it,expect} from 'vitest';
import {resolveInsurance,type InsuranceCandidate} from './insurance';
import {BOOKMAKER_REGISTRY,VISIBLE_BOOKMAKERS} from './registry';
const candidate=(bookmaker:string,decimalOdds='2.10',overrides:Partial<InsuranceCandidate<string>>={}):InsuranceCandidate<string>=>({bookmaker,decimalOdds,current:true,priceKind:'REAL',value:bookmaker,...overrides});

/**
 * After the MX/CO/PE cutover no operator holds the HIDDEN_INSURANCE role: Betano was Brazil's
 * preferred source and is now unpurchasable, so that branch is dormant and these tests pin it there.
 *
 * The resolver also no longer substitutes one visible book's price into another's row. That was the
 * only reachable substitution path, and presenting bookmaker B's price inside bookmaker A's identity
 * is exactly the falsification the data-integrity rule forbids. Continuity when a primary book has no
 * price is served by an explicitly attributed FALLBACK_REFERENCE row instead; see fallback-pool.ts and
 * fallback-reference.test.ts. Production already set insuranceEnabled false on both read paths, so
 * removing it changed no live behaviour.
 *
 * The resolver is GEO-agnostic and its inputs arrive pre-scoped, so the candidate sets below exercise
 * resolution mechanics only. Real per-GEO eligibility is asserted in fallback-reference.test.ts.
 */
describe('exact-selection native insurance resolver',()=>{
  it('has no preferred insurance source configured any more',()=>{
    expect(BOOKMAKER_REGISTRY.some(b=>b.displayRole==='HIDDEN_INSURANCE')).toBe(false);
    // The HIDDEN_INSURANCE_USED branch is therefore unreachable, and nothing reports a failed preference.
    const result=resolveInsurance('betsson',[candidate('bwin')]);
    expect(result.resolution).not.toBe('HIDDEN_INSURANCE_USED');
    expect(result.preferredInsuranceFailed).toBe(false);
  });

  it('own REAL wins immediately',()=>{
    expect(resolveInsurance('betsson',[candidate('bwin'),candidate('betsson','2.22')]).resolution).toBe('OWN_REAL');
    expect(resolveInsurance('betsson',[candidate('bwin'),candidate('betsson','2.22')]).candidate?.bookmaker).toBe('betsson');
  });

  it('never hands one visible book another visible book price',()=>{
    // The central data-integrity rule: bookmaker B's price is never bookmaker A's actual price. Betsson
    // and bwin are the real Colombian pair, so this is the substitution that would otherwise be tempting.
    const result=resolveInsurance('betsson',[candidate('bwin')]);
    expect(result.resolution).toBe('NO_INSURANCE_AVAILABLE');
    expect(result.candidate).toBeNull();
  });

  it('refuses a cross-primary substitution however many alternates are available',()=>{
    // Not "pick the least flattering alternate" — pick none at all.
    const sources=[candidate('bwin','2.18'),candidate('inkabet','2.05')];
    expect(resolveInsurance('betsson',sources).candidate).toBeNull();
    expect(resolveInsurance('betsson',[...sources].reverse()).candidate).toBeNull();
    for(const target of ['betsson','bwin','inkabet','1xbet'])
      expect(resolveInsurance(target,sources.filter(s=>s.bookmaker!==target)).resolution).toBe('NO_INSURANCE_AVAILABLE');
  });

  it('keeps insurance priority strictly ordered for the dormant hidden-source branch',()=>{
    // Nothing consumes the ordering while no operator holds HIDDEN_INSURANCE, but the configuration must
    // stay unambiguous so re-introducing a hidden source can never be input-order dependent.
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
