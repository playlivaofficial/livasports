import {describe,it,expect} from 'vitest';
import {firstFullSearchDay,observationWindow,observationAssessment,descriptiveDelta} from './experiment-windows';
const low={clicks:0,impressions:60,ctr:0,position:12};
describe('metadata observation windows',()=>{
  it('starts after the release day in GSC Pacific time, including a UTC date boundary',()=>{
    expect(firstFullSearchDay(new Date('2026-09-28T06:00:00Z'))).toBe('2026-09-28');
    expect(firstFullSearchDay(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-29');
    expect(firstFullSearchDay(new Date('2026-03-08T10:00:00Z'))).toBe('2026-03-09');
  });
  it('uses fixed complete 7/14/28-day windows, not sliding dates',()=>{
    expect(observationWindow('2026-09-29',7)).toEqual({from:'2026-09-29',to:'2026-10-05',days:7});
    expect(observationWindow('2026-09-29',14).to).toBe('2026-10-12');
    expect(observationWindow('2026-09-29',28).to).toBe('2026-10-26');
  });
  it('never labels low samples or incomplete windows a winner',()=>{
    expect(observationAssessment(low,low,false)).toBe('AWAITING_COMPLETE_WINDOW');
    expect(observationAssessment(low,low,true)).toBe('INSUFFICIENT_DATA');
    expect(observationAssessment({...low,clicks:10,impressions:1000},{...low,clicks:20,impressions:1000},true)).toBe('DESCRIPTIVE_ONLY');
  });
  it('labels CTR change in percentage points, not a misleading percentage uplift',()=>{
    expect(descriptiveDelta(low,{clicks:2,impressions:100,ctr:0.02,position:10})).toEqual({clicks:2,impressions:40,ctrPercentagePoints:2,position:-2});
  });
});
