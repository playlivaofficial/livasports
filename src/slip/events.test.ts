import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/components/match/events',()=>({emitProductEvent:vi.fn()}));
import {emitProductEvent} from '@/components/match/events';
import {emitSlipEvent} from './events';
import {parseSlipEvent} from './analytics-server';
import {SLIP_SCOPE,type SavedSelection} from './types';

const stored:SavedSelection={fixturePublicId:'5f1a670a87b74fc9',scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'DRAW',line:null,addedAt:'2026-09-22T12:09:06.368Z'};
const payload=()=>vi.mocked(emitProductEvent).mock.calls[0][0] as {selection?:Record<string,unknown>};

describe('slip analytics payloads',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('strips the stored addedAt field, which the events API rejects (production 400 on every removal)',()=>{
    emitSlipEvent('slip_selection_remove','mx',stored,undefined,{legCount:1});
    expect(payload().selection).toEqual({fixturePublicId:stored.fixturePublicId,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'DRAW',line:null});
    expect(payload().selection).not.toHaveProperty('addedAt');
  });
  it('produces a body the server parser accepts',()=>{
    emitSlipEvent('slip_selection_remove','mx',stored);
    const parsed=parseSlipEvent({eventName:'slip_selection_remove',locale:'mx',placement:'guest-slip',eventId:'cf02b11a-a066-4682-b821-246dd652a049',selection:payload().selection});
    expect(parsed).not.toBeNull();
    expect(parsed!.selection).toMatchObject({fixturePublicId:stored.fixturePublicId,outcome:'DRAW'});
  });
  it('rejects the old payload, proving the regression this guards against',()=>{
    expect(parseSlipEvent({eventName:'slip_selection_remove',locale:'mx',placement:'guest-slip',eventId:'cf02b11a-a066-4682-b821-246dd652a049',selection:stored})).toBeNull();
  });
  it('keeps aggregate events (clear, open) selection-free',()=>{
    emitSlipEvent('slip_clear','br',undefined,undefined,{legCount:0});
    expect(payload()).not.toHaveProperty('selection');
  });
});
