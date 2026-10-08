import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {readOddsSnapshot,readListingOddsSnapshots,readPublicOddsFixtures,readSlipComparison} from './read-repository';
import {buildComparison} from './comparison';
afterEach(()=>vi.restoreAllMocks());
describe('DB-only odds navigation',()=>{
  const row={kickoff:new Date('2026-09-12T19:00:00Z'),fixture_status:'SCHEDULED',bookmaker_id:'b',provider_slug:'codere',display_name:'Codere',
    source_domain:'codere.com.co',source_domains:['codere.com.co'],destination_domains:[],source_geo:'CO',source_verification_state:'VERIFIED',display_eligible:true,verification_state:'VERIFIED',geo_eligible:true,mapping_verified:true,scope:'FULL_TIME_REGULATION',phase:'PREGAME',observed_at:new Date(),provider_updated_at:new Date(),persisted_at:new Date(),last_successful_refresh_at:new Date(),provider_kickoff:new Date('2026-09-12T19:00:00Z'),market_code:'MATCH_WINNER',outcome_code:'HOME',line:null,decimal_odds:'2.12345678',status:'ACTIVE',destination:null};
  it('uses a single bounded DB read and no upstream provider call',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row]});const fetch=vi.spyOn(globalThis,'fetch');
    const result=await readOddsSnapshot({query},'f','CO');
    expect(query).toHaveBeenCalledTimes(1);    expect(query.mock.calls[0][0]).toContain('LIMIT 200');expect(query.mock.calls[0][0]).not.toContain("o.market_code='MATCH_WINNER'");
    expect(query.mock.calls[0][0]).toContain("abs(extract(epoch from ((fm.metadata->>'canonicalKickoff')::timestamptz - f.kickoff))) <= 600");
    expect(query.mock.calls[0][0]).toContain('o.source_mapping_verified AND');
    expect(query.mock.calls[0][0]).toContain('FROM odds_geo_current');
    expect(query.mock.calls[0][0]).toContain("$2 IN ('MX','CO','PE') AND (geo=$2 OR");
    expect(query.mock.calls[0][0]).toContain('period_end>now() AND verified_at IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain('opm.provider_bookmaker_id=o.provider_bookmaker_id');
    expect(query.mock.calls[0][0]).toContain("g.verification_state IN ('VERIFIED','VERIFIED_'||co.iso2)");
    expect(query.mock.calls[0][0]).toContain("g.legal_status='VERIFIED'");
    expect(query.mock.calls[0][0]).toContain("g.legal_verified_at IS NOT NULL AND NULLIF(trim(g.legal_reference),'') IS NOT NULL");
    expect(query.mock.calls[0][0]).not.toContain('FROM odds_current');
    expect(query.mock.calls[0][0]).not.toContain('FROM odds_native_source_current');
    expect(query.mock.calls[0][0]).toContain("COALESCE(mr.evidence->>'providerCompetitionId', fm.metadata->>'providerCompetitionId')");
    expect(query.mock.calls[0][0]).not.toContain('o.provider_kickoff=');expect(fetch).not.toHaveBeenCalled();
    expect(result.quotes[0].decimalOdds).toBe('2.12345678');expect(result.quotes[0].geoEligible).toBe(true);expect(result.destinations).toEqual({});fetch.mockRestore();
  });
  it('never reuses a configured country source outside its requested GEO',async()=>{
    for(const geo of ['MX','PE',null] as const)expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[row]})},'f',geo)).quotes[0].geoEligible).toBe(false);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[row]})},'f','CO')).quotes[0].geoEligible).toBe(true);
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,source_verification_state:'GENERIC_UNVERIFIED'}]})},'f','CO')).quotes[0].geoEligible).toBe(false);
  });
  it('denies quotes after a canonical participant/competition mapping changes',async()=>{
    expect((await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...row,mapping_verified:false}]})},'f','CO')).quotes[0].geoEligible).toBe(false);
  });
  const now=Date.parse('2026-09-12T18:00:00Z'),fixtureId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',publicId='abcdef0123456789';
  it('keeps the slip target pool fail-closed when legal evidence or exact-country verification is revoked',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});
    const result=await readSlipComparison({query},[publicId],'CO');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['CO']);
    expect(query.mock.calls[1][0]).toContain("g.legal_status='VERIFIED'");
    expect(query.mock.calls[1][0]).toContain("g.verification_state IN ('VERIFIED','VERIFIED_'||c.iso2)");
    expect(query.mock.calls[1][0]).toContain("g.legal_verified_at IS NOT NULL AND NULLIF(trim(g.legal_reference),'') IS NOT NULL");
    expect(query.mock.calls[1][0]).toContain('p.country_id=c.id AND p.verified_at IS NOT NULL');
    expect(result.bookmakers).toEqual([]);expect(result.destinations).toEqual({});
  });
  const current={...row,canonical_fixture_id:fixtureId,public_id:publicId,observed_at:new Date(now),provider_updated_at:new Date(now),last_successful_refresh_at:new Date(now)};
  it('hydrates source-verified references separately and never emits a foreign affiliate destination',async()=>{
    const source={...current,id:'quote',provider_fixture_id:'event',provider_slug:'bwin',display_name:'bwin',provider_bookmaker_id:'bwin',source_provider:'ODDSPAPI',source_domain:'sports.bwin.com',source_domains:['sports.bwin.com'],destination:'https://sports.bwin.com/'};
    const query=vi.fn().mockResolvedValue({rows:[source]});
    const snapshot=await readOddsSnapshot({query},fixtureId,'MX');
    expect(snapshot.referenceQuotes).toHaveLength(1);
    expect(snapshot.referenceQuotes![0]).toMatchObject({quoteId:'quote',fixtureId,sourceGeo:'CO',targetGeo:'MX',bookmaker:'bwin'});
    expect(snapshot.quotes[0].geoEligible).toBe(false);expect(snapshot.destinations).toEqual({});expect(snapshot.eligibleBookmakers).toEqual([]);
    expect(buildComparison(snapshot,'MATCH_WINNER',now).references?.[0].quoteId).toBe('quote');
    for(const override of [{mapping_verified:false},{display_eligible:false},{source_domain:'unverified.invalid'},{provider_bookmaker_id:'wrong'},{source_provider:'UNVERIFIED'}]){
      query.mockResolvedValue({rows:[{...source,...override}]});
      expect((await readOddsSnapshot({query},fixtureId,'MX')).referenceQuotes).toEqual([]);
    }
    for(const geo of [null,'BR'] as const){query.mockResolvedValue({rows:[source]});expect((await readOddsSnapshot({query},fixtureId,geo)).referenceQuotes).toEqual([]);}
  });
  const betsson={...current,bookmaker_id:'s',provider_slug:'betsson',display_name:'Betsson',source_domain:'betsson.co',source_domains:['betsson.co'],destination_domains:['betsson.co'],decimal_odds:'2.20',
    destination:'https://betsson.co/',active_campaigns:[{type:'SPORTSBOOK',placements:['match_odds_table'],domains:['betsson.co']}]};

  it.each(['MX','CO','PE'] as const)('preserves identical current prices in match/listing/saved readers for GEO %s',async geo=>{
    const query=vi.fn().mockResolvedValue({rows:[current,betsson].map(r=>({...r,source_geo:geo,geo_eligible:true}))});
    const fetch=vi.spyOn(globalThis,'fetch');
    const match=await readOddsSnapshot({query},fixtureId,geo);
    const listing=(await readListingOddsSnapshots({query},[fixtureId],geo)).get(fixtureId)!;
    const saved=(await readPublicOddsFixtures({query},[publicId],geo)).get(publicId)!.snapshot;
    expect(saved.approvedNativeProviders).toEqual(['ODDSPAPI']);
    for(const snapshot of [match,listing,saved])expect(buildComparison(snapshot,'MATCH_WINNER',now).rows.map(r=>r.cells[0].decimalOdds)).toEqual(['2.20','2.12345678']);
    expect(match.destinations).toEqual({betsson:betsson.destination});
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("o.market_code='MATCH_WINNER'");
    expect(query.mock.calls[2][0]).toContain('LIMIT 500');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{mapping_verified:false},{display_eligible:false},{source_verification_state:'GENERIC_UNVERIFIED'},{source_domain:'unknown.invalid'},{source_geo:'MX'},{source_domain:null}])('rejects unverified content %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...current,...override}]})},fixtureId,'CO');
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });
  it.each([{status:'SUSPENDED'},{status:'CLOSED'},{fixture_status:'LIVE'},{kickoff:new Date(now)},
    {observed_at:new Date(now-86400000),last_successful_refresh_at:new Date(now-86400000)}])('retains freshness and pregame checks %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...current,...override}]})},fixtureId,'CO');
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(0);
  });
  it('denies foreign destinations outside their GEO even if a destination row is populated',async()=>{
    for(const geo of [null,'MX'] as const){
      const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[betsson]})},fixtureId,geo);
      expect(snapshot.quotes[0].geoEligible).toBe(false);expect(snapshot.destinations).toEqual({});
    }
  });
  it.each([{geo_eligible:false},{verification_state:'GENERIC_UNVERIFIED'},{active_campaigns:[]},{destination:null}])('requires active commercial approval %j',async override=>{
    const snapshot=await readOddsSnapshot({query:vi.fn().mockResolvedValue({rows:[{...betsson,...override}]})},fixtureId,'CO');
    expect(buildComparison(snapshot,'MATCH_WINNER',now).eligiblePrices).toBe(1);expect(snapshot.destinations).toEqual({});
  });
});
