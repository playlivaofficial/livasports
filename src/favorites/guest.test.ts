import {describe,expect,it} from 'vitest';
import {EMPTY_FAVORITES,FAVORITE_LIMIT} from './identity';
import {parseGuestFavorites,toggleGuestFavorite} from './guest';

describe('guest favorite storage',()=>{
  it('parses a valid versioned payload and rejects malformed localStorage',()=>{
    expect(parseGuestFavorites('{"version":1,"teams":["0123456789abcdef"],"competitions":["premier-league"],"fixtures":["fedcba9876543210"]}')).toEqual({
      version:1,teams:['0123456789abcdef'],competitions:['premier-league'],fixtures:['fedcba9876543210'],
    });
    expect(parseGuestFavorites('{')).toEqual(EMPTY_FAVORITES);
    expect(parseGuestFavorites('[]')).toEqual(EMPTY_FAVORITES);
    expect(parseGuestFavorites({version:2,teams:['0123456789abcdef']})).toEqual(EMPTY_FAVORITES);
    expect(parseGuestFavorites({version:1,teams:['not-an-id'],competitions:['BAD'],fixtures:['x']})).toEqual(EMPTY_FAVORITES);
  });

  it('deduplicates, ignores odds payloads and stays bounded',()=>{
    const once=parseGuestFavorites({version:1,teams:['0123456789abcdef','0123456789abcdef'],odds:{price:1.9}});
    expect(once.teams).toEqual(['0123456789abcdef']);
    const many={version:1,teams:Array.from({length:FAVORITE_LIMIT+8},(_,i)=>i.toString(16).padStart(16,'0'))};
    expect(parseGuestFavorites(many).teams).toHaveLength(FAVORITE_LIMIT);
    expect(toggleGuestFavorite(EMPTY_FAVORITES,'team','0123456789abcdef',true).teams).toEqual(['0123456789abcdef']);
    expect(toggleGuestFavorite(toggleGuestFavorite(EMPTY_FAVORITES,'team','0123456789abcdef',true),'team','0123456789abcdef',false).teams).toEqual([]);
  });
});
