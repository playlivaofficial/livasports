import {EMPTY_FAVORITES,FAVORITE_LIMIT,FAVORITE_SCHEMA_VERSION,FAVORITE_STORAGE_KEY,type FavoriteKind,type GuestFavorites,uniqueIds} from './identity';

export function parseGuestFavorites(raw:unknown):GuestFavorites {
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value||typeof value!=='object'||Array.isArray(value))return EMPTY_FAVORITES;
    const record=value as Record<string,unknown>;
    if(record.version!==FAVORITE_SCHEMA_VERSION)return EMPTY_FAVORITES;
    return {
      version:FAVORITE_SCHEMA_VERSION,
      teams:uniqueIds(Array.isArray(record.teams)?record.teams:[],'team'),
      competitions:uniqueIds(Array.isArray(record.competitions)?record.competitions:[],'competition'),
      fixtures:uniqueIds(Array.isArray(record.fixtures)?record.fixtures:[],'fixture'),
    };
  }catch{
    return EMPTY_FAVORITES;
  }
}

export function hasGuestFavorites(value:GuestFavorites):boolean {
  return value.teams.length+value.competitions.length+value.fixtures.length>0;
}

export function toggleGuestFavorite(current:GuestFavorites,kind:FavoriteKind,id:string,favorited:boolean):GuestFavorites {
  const key=kind==='team'?'teams':kind==='competition'?'competitions':'fixtures';
  const ids=uniqueIds(favorited?[...current[key],id]:current[key].filter(item=>item!==id),kind);
  if(favorited&&current[key].includes(id)===false&&current[key].length>=FAVORITE_LIMIT)return current;
  return {...current,[key]:ids};
}

export function readGuestFavorites(storage:Pick<Storage,'getItem'>|null):GuestFavorites {
  if(!storage)return EMPTY_FAVORITES;
  try{return parseGuestFavorites(storage.getItem(FAVORITE_STORAGE_KEY));}
  catch{return EMPTY_FAVORITES;}
}

export function writeGuestFavorites(storage:Pick<Storage,'setItem'|'removeItem'>|null,value:GuestFavorites):boolean {
  if(!storage)return false;
  try{
    if(!hasGuestFavorites(value))storage.removeItem(FAVORITE_STORAGE_KEY);
    else storage.setItem(FAVORITE_STORAGE_KEY,JSON.stringify(value));
    return true;
  }catch{return false;}
}
