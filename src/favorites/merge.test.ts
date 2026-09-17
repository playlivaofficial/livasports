import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {writeGuestFavorites} from './guest';
import {FAVORITE_STORAGE_KEY} from './identity';

describe('guest to account merge safety',()=>{
  it('does not clear local guest favorites unless the server merge succeeds',()=>{
    const source=readFileSync('src/favorites/FavoritesSync.tsx','utf8');
    expect(source).toContain("if(!merged.ok){applyAccountFavorites(body,true);markFavoritesError('merge');return;}");
    expect(source.lastIndexOf('writeGuestFavorites')).toBeGreaterThan(source.indexOf("if(!merged.ok)"));
  });

  it('retains guest data when storage writes fail',()=>{
    const storage={getItem:()=>null,setItem:()=>{throw new Error('quota');},removeItem:()=>{}};
    expect(writeGuestFavorites(storage,{version:1,teams:['0123456789abcdef'],competitions:[],fixtures:[]})).toBe(false);
    expect(FAVORITE_STORAGE_KEY).toBe('livasports:guest-favorites:v1');
  });
});
