import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {outboundRequest,legacySlipRequest,type CommercialServices} from './server';
import {publicOffer,resolveOffer} from './service';
import {campaign,context as betssonContext,key} from './fixtures.test-support';
import {comparisonFixture} from '@/slip/comparison-fixtures.test-support';
import type {Campaign,CommercialContext} from './types';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

const DESTINATION='https://1xaff.com.br/L?tag=d_6128686m_134462c_&site=6128686&ad=134462';
const onexbet=(overrides:Partial<Campaign>={}):Campaign=>({...campaign(),
  id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bookmaker:'1xbet',operatorCampaignId:'7035424',
  destination:DESTINATION,domains:['1xaff.com.br'],
  placements:['match_odds_table','match_slip_comparison','slip_bookmaker_comparison','match_inline','home_top_banner'],
  creatives:[],...overrides});
const MATCH_PATH='/br/jogo/home-x-away-abcdef0123456789';
const ctx=(placement:CommercialContext['placement']='match_odds_table'):CommercialContext=>placement==='match_odds_table'
  ?{locale:'br',bookmaker:'1xbet',pagePath:MATCH_PATH,placement,fixturePublicId:'abcdef0123456789',market:'MATCH_WINNER'}
  :{locale:'br',bookmaker:'1xbet',pagePath:'/br',placement,selections:comparisonFixture(2).selections};

async function harness(c=onexbet(),context=ctx()){
  const tasks:Array<()=>Promise<void>>=[];
  const deps={campaigns:async()=>[c],page:async(x:CommercialContext)=>({pageType:'HOME' as const,pagePath:x.pagePath}),
    pricing:async()=>Date.now()+60000};
  const offer=(await resolveOffer(context,deps))!;
  const value=publicOffer(offer,key);
  const services:CommercialServices={deps,key,geo:()=>true,defer:fn=>{tasks.push(fn);},
    click:vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),impression:vi.fn().mockResolvedValue(undefined)};
  const request=(extra:Record<string,string>={},suffix='')=>new Request('https://livasports.com'+value.href+suffix,
    {headers:{'sec-fetch-user':'?1','sec-fetch-mode':'navigate','sec-fetch-dest':'document','user-agent':'Browser',...extra}});
  return {tasks,c,offer,value,services,request,context};
}

describe('1xBet outbound redirect',()=>{
  it('issues a 303 to the verified 1xAff destination with the partner tag intact',async()=>{
    const f=await harness();
    const r=await outboundRequest(f.request(),'1xbet','match_odds_table',f.services);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe(DESTINATION);
    // The partner tag must survive untouched: no stripping, no reconstruction.
    expect(new URL(r.headers.get('location')!).searchParams.get('tag')).toBe('d_6128686m_134462c_');
  });
  it('records the click as 1xbet on the right placement',async()=>{
    const f=await harness();
    await outboundRequest(f.request(),'1xbet','match_odds_table',f.services);
    expect(f.tasks).toHaveLength(1);await f.tasks[0]();
    expect(f.services.click).toHaveBeenCalledWith(
      expect.objectContaining({campaign:expect.objectContaining({bookmaker:'1xbet'}),
        context:expect.objectContaining({placement:'match_odds_table'})}),
      expect.any(String),'HUMAN_CLICK',key);
  });
  it('completes an owner QA redirect while still classifying the click as QA_TEST',async()=>{
    const f=await harness();
    const r=await outboundRequest(f.request({},'&qa=1'),'1xbet','match_odds_table',f.services);
    // QA must reach the real destination so an owner can verify the partner link end to end.
    expect(r.headers.get('location')).toBe(DESTINATION);
    await f.tasks[0]();
    expect(f.services.click).toHaveBeenCalledWith(expect.anything(),expect.any(String),'QA_TEST',key);
  });
  it('serves the slip CTA',async()=>{
    const f=await harness(onexbet(),ctx('slip_bookmaker_comparison'));
    const r=await outboundRequest(f.request(),'1xbet','slip_bookmaker_comparison',f.services);
    expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(DESTINATION);
  });
  it('accepts 1xbet on the legacy slip route',async()=>{
    const f=await harness();
    const url='https://livasports.com/go/slip/1xbet?locale=br&selections='+encodeURIComponent(JSON.stringify([{fixturePublicId:'abcdef0123456789',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:'FULL_TIME_REGULATION'}]));
    const r=await legacySlipRequest(new Request(url,{headers:{'user-agent':'Browser'}}),'1xbet',f.services);
    expect(r.status).not.toBe(400);
  });
  it('never mints an offer for a destination outside the verified 1xAff host',async()=>{
    // safeAffiliateDestination refuses the operator domain, so resolution fails before a token exists.
    const deps={campaigns:async()=>[onexbet({destination:'https://1xbet.com/?ref=x',domains:['1xbet.com']})],
      page:async(x:CommercialContext)=>({pageType:'HOME' as const,pagePath:x.pagePath}),pricing:async()=>Date.now()+60000};
    expect(await resolveOffer(ctx(),deps)).toBeNull();
  });
  it('leaves Betsson behaviour unchanged',async()=>{
    const f=await harness(campaign(),betssonContext());
    const r=await outboundRequest(f.request(),'betsson','slip_bookmaker_comparison',f.services);
    expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(campaign().destination);
  });
});
