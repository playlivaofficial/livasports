import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {outboundRequest,legacySlipRequest,type CommercialServices} from './server';
import {publicOffer,resolveOffer} from './service';
import {campaign,context as betssonContext,key} from './fixtures.test-support';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import {ACTIVE_BOOKMAKER_IDS,BOOKMAKER_REGISTRY,SOURCE_BOOKMAKER_IDS,VISIBLE_BOOKMAKERS,bookmakerConfig,isRetiredBookmaker,isVisibleBookmaker} from '@/odds/registry';
import {canonicalBookmakerSlug} from '@/odds/bookmaker';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {parseContext} from './policy';
import type {Campaign,CommercialContext} from './types';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

/**
 * 1xBet was dropped from the OddsPapi subscription on 2026-10-02 by the MX/CO/PE cutover and its
 * Brazilian affiliate links were disabled by migration 057, so it is RETIRED: unpurchasable and
 * non-commercial. These were its outbound-link tests; they now pin the retired contract instead, so
 * a later change cannot quietly resurrect an operator we can neither price nor legally promote.
 */
const RETIRED='1xbet';
const DESTINATION='https://1xaff.com.br/L?tag=synthetic-test-only&site=test-only&ad=test-only';
const onexbet=(overrides:Partial<Campaign>={}):Campaign=>({...campaign(),
  id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bookmaker:RETIRED,operatorCampaignId:'SYNTHETIC_CAMPAIGN',
  destination:DESTINATION,domains:['1xaff.com.br'],
  placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison','match_inline','home_top_banner'],
  creatives:[],...overrides});
const MATCH_PATH='/br/jogo/home-x-away-abcdef0123456789';
const ctx=(placement:CommercialContext['placement']='match_odds_table'):CommercialContext=>placement==='match_odds_table'
  ?{locale:'br',bookmaker:RETIRED,pagePath:MATCH_PATH,placement,fixturePublicId:'abcdef0123456789',market:'MATCH_WINNER'}
  :{locale:'br',bookmaker:RETIRED,pagePath:'/br',placement,selections:comparisonFixture(2).selections};

const deps=(c:Campaign)=>({campaigns:async()=>[c],
  page:async(x:CommercialContext)=>({pageType:'HOME' as const,pagePath:x.pagePath}),pricing:async()=>Date.now()+60000});
const services=(c:Campaign):CommercialServices=>({deps:deps(c),key,geo:()=>true,defer:()=>{},
  click:vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),impression:vi.fn().mockResolvedValue(undefined)});
const browser=(href:string)=>new Request('https://livasports.com'+href,
  {headers:{'sec-fetch-user':'?1','sec-fetch-mode':'navigate','sec-fetch-dest':'document','user-agent':'Browser'}});

describe('retired bookmaker contract (1xBet)',()=>{
  it('is registered as RETIRED rather than removed',()=>{
    expect(isRetiredBookmaker(RETIRED)).toBe(true);
    expect(bookmakerConfig(RETIRED)?.displayRole).toBe('RETIRED');
  });

  it('produces no outbound destination',async()=>{
    // Refused at the registry gate, before any token or campaign is consulted.
    expect(await outboundRequest(browser(`/go/${RETIRED}/match_odds_table?offer=anything`),RETIRED,'match_odds_table',services(onexbet()))).toMatchObject({status:400});
    expect(await legacySlipRequest(new Request('https://livasports.com/go/slip/'+RETIRED+'?locale=br&selections='+
      encodeURIComponent(JSON.stringify([{fixturePublicId:'abcdef0123456789',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION'}])),
      {headers:{'user-agent':'Browser'}}),RETIRED,services(onexbet()))).toMatchObject({status:400});
    // Even its own previously verified 1xAff host is refused now.
    expect(safeAffiliateDestination(RETIRED,'br',DESTINATION,['1xaff.com.br'])).toBeNull();
  });

  it('cannot mint an offer or a signed token on any placement',async()=>{
    for(const placement of ['match_odds_table','slip_bookmaker_comparison','match_inline','home_top_banner'] as const){
      expect(parseContext(ctx(placement as CommercialContext['placement']))).toBeNull();
      expect(await resolveOffer(ctx(placement as CommercialContext['placement']),deps(onexbet()))).toBeNull();
    }
  });

  it('produces no inline embed, banner or creative',async()=>{
    const withCreative=onexbet({creatives:[{id:'retired-creative',placement:'home_top_banner',locale:'br',
      imageUrl:'/sponsors/1xbet/banner.webp',imageAlt:'retired',width:728,height:90,approved:true,enabled:true,startsAt:null,endsAt:null}]});
    expect(await resolveOffer(ctx('home_top_banner'),deps(withCreative))).toBeNull();
  });

  it('is not requested from the provider and not displayed',()=>{
    expect(ACTIVE_BOOKMAKER_IDS).not.toContain(RETIRED);
    expect(VISIBLE_BOOKMAKERS.map(b=>b.canonicalId)).not.toContain(RETIRED);
    expect(isVisibleBookmaker(RETIRED)).toBe(false);
  });

  it('keeps historical identity and slug normalization intact',()=>{
    // Stored odds rows, analytics events and audit exports must still resolve after retirement.
    expect(SOURCE_BOOKMAKER_IDS).toContain(RETIRED);
    expect(BOOKMAKER_REGISTRY.find(b=>b.canonicalId===RETIRED)).toBeDefined();
    for(const historical of ['1xbet','1xbet.com','www.1xbet.com','1xbet.bet.br','www.1xbet.bet.br'])
      expect(canonicalBookmakerSlug(historical)).toBe(RETIRED);
    expect(bookmakerConfig(RETIRED)?.logoAsset).toBe('/bookmakers/1xbet.webp');
  });

  it('applies the same contract to every other retired operator',()=>{
    for(const retired of ['sportingbet.bet.br','betano.bet.br','betboo.bet.br']){
      expect(isRetiredBookmaker(retired)).toBe(true);
      expect(isVisibleBookmaker(retired)).toBe(false);
      expect(ACTIVE_BOOKMAKER_IDS).not.toContain(retired);
      expect(SOURCE_BOOKMAKER_IDS).toContain(retired);
    }
  });

  it('leaves an entitled operator unaffected',async()=>{
    const c=campaign();
    const offer=(await resolveOffer(betssonContext(),deps(c)))!;
    const value=publicOffer(offer,key);
    const r=await outboundRequest(browser(value.href),'betsson','slip_bookmaker_comparison',services(c));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe(c.destination);
  });
});
