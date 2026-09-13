import {describe,it,expect} from 'vitest';
import {scoreTickDue} from './score-ticker';
describe('score ticker backoff',()=>{
  const now=Date.parse('2026-09-13T18:00Z');
  it('runs independently on the existing tick with durable cooldown',()=>{
    expect(scoreTickDue(undefined,now)).toBe(true);
    expect(scoreTickDue({status:'SUCCEEDED',started_at:new Date(now-60000)},now)).toBe(false);
    expect(scoreTickDue({status:'SUCCEEDED',started_at:new Date(now-5*60000)},now)).toBe(true);
  });
  it('does not repeatedly spend requests with invalid authentication or a failed provider',()=>{
    expect(scoreTickDue({status:'FAILED',started_at:new Date(now-3600000),error_message:'SPORTMONKS 401 invalid token'},now)).toBe(false);
    expect(scoreTickDue({status:'FAILED',started_at:new Date(now-5*60000),error_message:'SPORTMONKS 500'},now)).toBe(false);
  });
});
