import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readCampaigns} from './repository';

const row={id:'campaign',operator_campaign_id:'approved',affiliate_link_id:'link',provider_slug:'codere',enabled:true,link_enabled:true,bookmaker_enabled:true,
  approved_at:'2026-01-01',link_approved:'2026-01-01',campaign_verified:true,commercial_status:'ACTIVE',affiliate_enabled:true,commercial_version:4,
  verified_at:'2026-01-01',odds_enabled:true,comparison_enabled:true,sportsbook_enabled:true,legal_status:'VERIFIED',legal_verified_at:'2026-01-01',legal_reference:'official evidence',provider_verified:true,verification_state:'VERIFIED',
  destination_domains:['codere.com.co'],destination_url:'https://codere.com.co/',destination_type:'SPORTSBOOK',placement_allowlist:['match_odds_table'],operator_domain_allowlist:['codere.com.co'],valid_from:'2026-01-01',valid_until:'2099-01-01',creatives:[]};
describe('country-specific commercial reads',()=>{
  it('loads candidate identities from DB and includes the current activation revision',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row]});
    expect((await readCampaigns({query},'co'))[0]).toMatchObject({bookmaker:'codere',locale:'co',enabled:true,affiliateApproved:true,geoEligible:true,commercialVersion:4});
    expect(query.mock.calls[0][1]).toEqual(['CO']);
    expect(query.mock.calls[0][0]).toContain('operator_provider_mappings');
    expect(query.mock.calls[0][0]).not.toContain('provider_slug=ANY');
  });
  it.each([{provider_verified:false},{legal_status:'UNVERIFIED'},{legal_verified_at:null},{legal_reference:null},{legal_reference:'  '},{sportsbook_enabled:false},{verified_at:null},{odds_enabled:false},{comparison_enabled:false}])('revokes eligibility when independent evidence is revoked: %j',async patch=>{
    const query=vi.fn().mockResolvedValue({rows:[{...row,...patch}]});
    expect((await readCampaigns({query},'co'))[0].geoEligible).toBeFalsy();
  });
  it('never revives BR campaigns from historical approval fields',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[row]});
    expect((await readCampaigns({query},'br'))[0].enabled).toBe(false);
  });
});
