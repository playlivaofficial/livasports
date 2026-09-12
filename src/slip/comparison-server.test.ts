import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {compareSlipRequest,currentSlipDestination,slipOutboundRequest} from './comparison-server';
import {parseComparisonEvent,recordComparisonEvent} from './comparison-analytics-server';
import {readSlipComparison} from '@/odds/read-repository';
import {comparisonFixture} from './comparison-fixtures.test-support';
import {campaign,dependencies,key} from '@/affiliate/fixtures.test-support';

afterEach(()=>vi.restoreAllMocks());
const payload=()=>({locale:'br',selections:comparisonFixture().selections});
const request=(body=JSON.stringify(payload()),url='https://livasports.com/api/slip/compare',origin='https://livasports.com')=>new Request(url,{method:'POST',headers:{'content-type':'application/json',origin},body});
describe('M7 request/security boundary',()=>{
  it('accepts exact canonical selections through a no-store LivaSports read endpoint',async()=>{
    const resolve=vi.fn().mockResolvedValue({providerRequests:0});const fetch=vi.spyOn(globalThis,'fetch');const r=await compareSlipRequest(request(),{resolve});
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(resolve).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['{','null','[]',JSON.stringify({...payload(),url:'https://other.invalid'}),JSON.stringify({...payload(),selections:comparisonFixture(11).selections})])('rejects malformed %s before reading',async body=>{
    const resolve=vi.fn();expect((await compareSlipRequest(request(body),{resolve})).status).toBe(400);expect(resolve).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, oversized and query payloads and sanitizes failures',async()=>{
    const resolve=vi.fn().mockRejectedValue(new Error('private-database-credential'));
    expect((await compareSlipRequest(request(undefined,undefined,'https://evil.invalid'),{resolve})).status).toBe(403);
    expect((await compareSlipRequest(request(' '.repeat(4097)),{resolve})).status).toBe(413);
    expect((await compareSlipRequest(request(undefined,'https://livasports.com/api/slip/compare?url=evil'),{resolve})).status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();const r=await compareSlipRequest(request(),{resolve});expect(r.status).toBe(503);expect(await r.text()).not.toContain('private-database');
  });
  it('re-reads every exact selection for the approved destination, never relying on cached totals',async()=>{
    const f=comparisonFixture(3,Date.now());const read=vi.fn().mockResolvedValue(f.data),fetch=vi.spyOn(globalThis,'fetch');
    expect(await currentSlipDestination('betsson',f.selections,'br',read)).toBe(f.data.destinations.betsson);
    expect(await currentSlipDestination('betano.bet.br',f.selections,'br',read)).toBeNull();
    expect(await currentSlipDestination('betsson',f.selections,'mx',read)).toBeNull();
    f.data.fixtures.get(f.selections[1].fixturePublicId)!.snapshot.quotes[0].status='SUSPENDED';
    expect(await currentSlipDestination('betsson',f.selections,'br',read)).toBeNull();expect(read).toHaveBeenCalledTimes(4);expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses a CTA with expired, started, partial or unconfigured bookmaker coverage',async()=>{
    for(const scenario of ['expired','started','partial','unconfigured','unapproved']){
      const f=comparisonFixture(3,Date.now()-(scenario==='expired'?900001:0));const r=f.data.fixtures.get(f.selections[0].fixturePublicId)!;
      if(scenario==='started'){r.fixture.status='LIVE';r.snapshot.fixtureStatus='LIVE';}
      if(scenario==='partial')r.snapshot.quotes.shift();
      if(scenario==='unconfigured')f.data.bookmakers[0].affiliateEligibility.destinationConfigured=false;
      if(scenario==='unapproved')f.data.bookmakers[0].affiliateEligibility.approved=false;
      expect(await currentSlipDestination('betsson',f.selections,'br',async()=>f.data)).toBeNull();
    }
  });
  it('outbound does not accept arbitrary destinations, duplicate arguments or provider identity',async()=>{
    const query=new URLSearchParams({locale:'br',selections:JSON.stringify(payload().selections)}),c=campaign(),deps=dependencies(c);const pricing=vi.fn().mockResolvedValue(null);deps.pricing=pricing;
    const service={deps,key,geo:()=>true,defer:vi.fn(),click:vi.fn(),impression:vi.fn()};
    for(const suffix of ['&url=https://evil.invalid','&locale=mx','&destination=evil'])expect((await slipOutboundRequest(new Request(`https://livasports.com/go/slip/betsson?${query}${suffix}`),'betsson',service)).status).toBe(400);
    expect(pricing).not.toHaveBeenCalled();const unavailable=await slipOutboundRequest(new Request(`https://livasports.com/go/slip/betsson?${query}`),'betsson',service);
    expect(unavailable.headers.get('location')).toBe('https://livasports.com/br?slip=unavailable');
    pricing.mockResolvedValue(Date.now()+60000);const r=await slipOutboundRequest(new Request(`https://livasports.com/go/slip/betsson?${query}`),'betsson',service);
    expect(r.status).toBe(303);expect(r.headers.get('referrer-policy')).toBe('no-referrer');expect(r.headers.get('cache-control')).toContain('no-store');
  });
  it('queries only current quotes and bookmaker configuration in two bounded queries for ten selections',async()=>{
    const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{provider_slug:'betsson',display_name:'Betsson',affiliate_status:'ACTIVE',verification_state:'VERIFIED_BR',destination:'https://betsson.bet.br/?partner=test-only',active_campaigns:[{type:'HOMEPAGE',placements:['slip_bookmaker_comparison'],domains:['betsson.bet.br']}]}]});
    const fetch=vi.spyOn(globalThis,'fetch');const r=await readSlipComparison({query},comparisonFixture(10).selections.map(s=>s.fixturePublicId),'br');
    expect(query).toHaveBeenCalledTimes(2);expect(query.mock.calls[0][0]).toContain('ANY($1::text[])');expect(query.mock.calls[0][0]).toContain('LIMIT 500');
    expect(query.mock.calls.every(c=>!c[0].includes('odds_history'))).toBe(true);expect(r.bookmakers[0].affiliateEligibility.destinationConfigured).toBe(true);expect(fetch).not.toHaveBeenCalled();
  });
});

describe('M7 anonymous analytics',()=>{
  const event={eventId:'test-id',eventName:'slip_bookmaker_complete',locale:'br',placement:'slip-comparison',selectionCount:3,availableCount:3,complete:true,bookmaker:'betsson',marketsSummary:{MATCH_WINNER:1,TOTAL_GOALS:1,BTTS:1}};
  it('validates counts, summaries and state, rejecting personal fields',()=>{
    expect(parseComparisonEvent(event)).not.toBeNull();
    for(const extra of [{selectionCount:11},{availableCount:4},{complete:false},{email:'private@test.invalid'},{marketsSummary:{MATCH_WINNER:3}},{bookmaker:'other'}])expect(parseComparisonEvent({...event,...extra})).toBeNull();
    expect(parseComparisonEvent({...event,eventName:'slip_bookmaker_partial',complete:false,availableCount:2})).not.toBeNull();
  });
  it('uses existing idempotent aggregate storage without fingerprint or user identity',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});await recordComparisonEvent({query},parseComparisonEvent(event)!);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT(event_id) DO NOTHING');expect(query.mock.calls[0][0]).not.toMatch(/ip_address|user_id|fingerprint/);
  });
});
