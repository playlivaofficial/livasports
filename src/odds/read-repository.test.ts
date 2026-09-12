import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readOddsSnapshot} from './read-repository';
describe('DB-only odds navigation',()=>{
  const row={kickoff:new Date('2026-09-12T19:00:00Z'),fixture_status:'SCHEDULED',bookmaker_id:'b',provider_slug:'betano.bet.br',display_name:'Betano BR',
    source_domain:'www.betano.bet.br',verification_state:'VERIFIED_BR',geo_eligible:true,mapping_verified:true,scope:'FULL_TIME_REGULATION',phase:'PREGAME',observed_at:new Date(),provider_updated_at:new Date(),persisted_at:new Date(),last_successful_refresh_at:new Date(),provider_kickoff:new Date('2026-09-12T19:00:00Z'),market_code:'MATCH_WINNER',outcome_code:'HOME',line:null,decimal_odds:'2.12345678',status:'ACTIVE',destination:null};
  it('uses a single bounded DB read and no upstream provider call',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row]});const fetch=vi.spyOn(globalThis,'fetch');
    const result=await readOddsSnapshot({query},'f','br');
    expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain('LIMIT 50');expect(fetch).not.toHaveBeenCalled();
    expect(result.quotes[0].decimalOdds).toBe('2.12345678');expect(result.quotes[0].geoEligible).toBe(true);expect(result.destinations).toEqual({});fetch.mockRestore();
  });
  it('independently denies BR-to-MX substitution and generic Betsson despite a mistaken DB geo flag',async()=>{
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[row]})},'f','mx')).quotes[0].geoEligible).toBe(false);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,provider_slug:'betsson',source_domain:'www.betsson.com'}]})},'f','br')).quotes[0].geoEligible).toBe(false);
  });
  it('denies quotes after a canonical participant/competition mapping changes',async()=>{
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,mapping_verified:false}]})},'f','br')).quotes[0].geoEligible).toBe(false);
  });
});
