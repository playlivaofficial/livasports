import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {readOddsSnapshot,readListingOddsSnapshots,readPublicOddsFixtures} from './read-repository';
import {buildComparison} from './comparison';
afterEach(()=>vi.restoreAllMocks());
describe('DB-only odds navigation',()=>{
  const row={kickoff:new Date('2026-09-12T19:00:00Z'),fixture_status:'SCHEDULED',bookmaker_id:'b',provider_slug:'betano.bet.br',display_name:'Betano BR',
    source_domain:'www.betano.bet.br',source_geo:'BR',source_verification_state:'VERIFIED_BR',display_eligible:true,verification_state:'VERIFIED_BR',geo_eligible:true,mapping_verified:true,scope:'FULL_TIME_REGULATION',phase:'PREGAME',observed_at:new Date(),provider_updated_at:new Date(),persisted_at:new Date(),last_successful_refresh_at:new Date(),provider_kickoff:new Date('2026-09-12T19:00:00Z'),market_code:'MATCH_WINNER',outcome_code:'HOME',line:null,decimal_odds:'2.12345678',status:'ACTIVE',destination:null};
  it('uses a single bounded DB read and no upstream provider call',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row]});const fetch=vi.spyOn(globalThis,'fetch');
    const result=await readOddsSnapshot({query},'f','BR');
    expect(query).toHaveBeenCalledTimes(1);    expect(query.mock.calls[0][0]).toContain('LIMIT 200');expect(query.mock.calls[0][0]).not.toContain("o.market_code='MATCH_WINNER'");
    expect(query.mock.calls[0][0]).toContain("abs(extract(epoch from ((fm.metadata->>'canonicalKickoff')::timestamptz - f.kickoff))) <= 600");
    expect(query.mock.calls[0][0]).toContain('o.source_mapping_verified OR');
    expect(query.mock.calls[0][0]).toContain("COALESCE(mr.evidence->>'providerCompetitionId', fm.metadata->>'providerCompetitionId')");
    expect(query.mock.calls[0][0]).not.toContain('o.provider_kickoff=');expect(fetch).not.toHaveBeenCalled();
    expect(result.quotes[0].decimalOdds).toBe('2.12345678');expect(result.quotes[0].geoEligible).toBe(true);expect(result.destinations).toEqual({});fetch.mockRestore();
  });
  it('shows verified BR sources worldwide, including MX and unknown commercial GEO',async()=>{
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[row]})},'f','MX')).quotes[0].geoEligible).toBe(true);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,provider_slug:'betsson',source_domain:'www.betsson.com'}]})},'f','BR')).quotes[0].geoEligible).toBe(true);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,provider_slug:'betsson',source_domain:'www.betsson.com',source_verification_state:'GENERIC_UNVERIFIED'}]})},'f','BR')).quotes[0].geoEligible).toBe(false);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,geo_eligible:false}]})},'f',null)).quotes[0].geoEligible).toBe(true);
  });
  it('denies quotes after a canonical participant/competition mapping changes',async()=>{
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,mapping_verified:false}]})},'f','BR')).quotes[0].geoEligible).toBe(false);
  });
  const now=Date.parse('2026-09-12T18:00:00Z'),fixtureId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',publicId='abcdef0123456789';
  const current={...row,canonical_fixture_id:fixtureId,public_id:publicId,observed_at:new Date(now),provider_updated_at:new Date(now),last_successful_refresh_at:new Date(now)};
  const betsson={...current,bookmaker_id:'s',provider_slug:'betsson',display_name:'Betsson',source_domain:'www.betsson.com',decimal_odds:'2.20',
    destination:'https://www.betsson.bet.br/',active_campaigns:[{type:'SPORTSBOOK',placements:['match_odds_table'],domains:['www.betsson.bet.br']}]};

  it.each([null,'BR','MX'] as const)('preserves identical current prices in match/listing/saved readers for GEO %s',async geo=>{
    const query=vi.fn().mockResolvedValue({rows:[current,betsson].map(r=>({...r,geo_eligible:geo==='BR'}))});
    const fetch=vi.spyOn(globalThis,'fetch');
    const match=await readOddsSnapshot({query},fixtureId,geo);
    const listing=(await readListingOddsSnapshots({query},[fixtureId],geo)).get(fixtureId)!;
    const saved=(await readPublicOddsFixtures({query},[publicId],geo)).get(publicId)!.snapshot;
    expect(saved.approvedNativeProviders).toEqual(['ODDSPAPI']);
    for(const snapshot of [match,listing,saved])expect(buildComparison(snapshot,'MATCH_WINNER',now).rows.map(r=>r.cells[0].decimalOdds)).toEqual(['2.20','2.12345678','2.12345678']);
    expect(match.destinations).toEqual(geo==='BR'?{betsson:betsson.destination}:{});
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("o.market_code='MATCH_WINNER'");
    expect(query.mock.calls[2][0]).toContain('LIMIT 500');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{mapping_verified:false},{display_eligible:false},{source_verification_state:'GENERIC_UNVERIFIED'},{source_domain:'unknown.invalid'},{source_geo:'MX'},{source_domain:null}])('rejects unverified content %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...current,...override}]})},fixtureId,null);
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });
  it.each([{status:'SUSPENDED'},{status:'CLOSED'},{fixture_status:'LIVE'},{kickoff:new Date(now)},
    {observed_at:new Date(now-86400000),last_successful_refresh_at:new Date(now-86400000)}])('retains freshness and pregame checks %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...current,...override}]})},fixtureId,null);
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });
  it('denies BR destinations outside BR even if a destination row is populated',async()=>{
    for(const geo of [null,'MX'] as const){
      const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[betsson]})},fixtureId,geo);
      expect(snapshot.quotes[0].geoEligible).toBe(true);expect(snapshot.destinations).toEqual({});
    }
  });
  it.each([{geo_eligible:false},{verification_state:'GENERIC_UNVERIFIED'},{active_campaigns:[]},{destination:null}])('requires active commercial approval %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...betsson,...override}]})},fixtureId,'BR');
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(3);expect(snapshot.destinations).toEqual({});
  });
});
