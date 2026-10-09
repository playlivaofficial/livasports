import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {resolveSlipRequest} from './server';
import {SLIP_SCOPE} from './types';
import {parseSlipEvent} from './analytics-server';
const payload={locale:'br',selections:[{fixturePublicId:'1111111111111111',market:'MATCH_WINNER',outcome:'HOME',line:null,scope:SLIP_SCOPE}]};
const request=(body=JSON.stringify(payload),origin='https://livasports.com')=>new Request('https://livasports.com/api/slip/resolve',{method:'POST',headers:{'content-type':'application/json',origin},body});
describe('slip API boundary',()=>{
  it('allows a bounded DB service and no-store response, without a provider call',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');const resolve=vi.fn().mockResolvedValue({providerRequests:0});const result=await resolveSlipRequest(request(),{resolve});
    expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');expect(resolve).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it.each(['{',JSON.stringify({...payload,selections:Array(11).fill(payload.selections[0])}),JSON.stringify({...payload,selections:[{...payload.selections[0],scope:'FIRST_HALF'}]}),JSON.stringify({...payload,provider:'ODDSPAPI'})])('rejects invalid body without invoking reads',async body=>{
    const resolve=vi.fn();expect((await resolveSlipRequest(request(body),{resolve})).status).toBe(400);expect(resolve).not.toHaveBeenCalled();
  });
  it('caps streamed body bytes and rejects other origins',async()=>{
    const resolve=vi.fn();expect((await resolveSlipRequest(request(' '.repeat(24001)),{resolve})).status).toBe(413);
    expect((await resolveSlipRequest(request(undefined,'https://other.invalid'),{resolve})).status).toBe(403);expect(resolve).not.toHaveBeenCalled();
  });
  it('returns sanitized errors with zero-provider accounting',async()=>{
    const resolve=vi.fn().mockRejectedValue(new Error('test-only-private-connection'));const response=await resolveSlipRequest(request(),{resolve});
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-connection');
  });
  it('restricts anonymous analytics to canonical intent and cannot accept personal fields',()=>{
    const base={eventId:'test',eventName:'slip_selection_add',locale:'br',placement:'guest-slip',selection:payload.selections[0]};
    expect(parseSlipEvent(base)).not.toBeNull();expect(parseSlipEvent({...base,email:'test@invalid'})).toBeNull();
    expect(parseSlipEvent({...base,selection:{...base.selection,bookmaker:'betsson'}})).toBeNull();
    expect(parseSlipEvent({eventName:'slip_open',locale:'mx',placement:'guest-slip'})).not.toBeNull();
  });
});
