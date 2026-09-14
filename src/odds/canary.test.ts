import {describe,expect,it} from 'vitest';
import {isProviderFixtureAbsent,parseOddsPapiHttpError} from './canary';

describe('singleton canary provider errors',()=>{
  it('treats OddsPapi FIXTURE_NOT_FOUND as an empty tournament, not a sibling-poisoning failure',()=>{
    const absent=new Error(JSON.stringify({status:404,endpoint:'/v4/odds-by-tournaments',query:{tournamentIds:'373'},body:{error:{code:'FIXTURE_NOT_FOUND',message:'No fixtures found'}}}));
    expect(parseOddsPapiHttpError(absent)).toEqual({status:404,code:'FIXTURE_NOT_FOUND'});
    expect(isProviderFixtureAbsent(absent)).toBe(true);
    const bad=new Error(JSON.stringify({status:400,body:{error:{code:'BAD_REQUEST'}}}));
    expect(isProviderFixtureAbsent(bad)).toBe(false);
    expect(isProviderFixtureAbsent(new Error('private'))).toBe(false);
  });
});
