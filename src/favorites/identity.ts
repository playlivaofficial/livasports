export const FAVORITE_STORAGE_KEY='livasports:guest-favorites:v1';
export const FAVORITE_SCHEMA_VERSION=1;
export const FAVORITE_LIMIT=50;
export type FavoriteKind='team'|'competition'|'fixture';
export type FavoriteReason='match'|'team'|'competition';

export interface GuestFavorites {
  version:typeof FAVORITE_SCHEMA_VERSION;
  teams:string[];
  competitions:string[];
  fixtures:string[];
}

export const EMPTY_FAVORITES:GuestFavorites={version:FAVORITE_SCHEMA_VERSION,teams:[],competitions:[],fixtures:[]};

export function isUuid(value:unknown):value is string {
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPublicId(value:unknown):value is string {
  return typeof value==='string'&&/^[a-f0-9]{16}$/i.test(value);
}

export function isCompetitionSlug(value:unknown):value is string {
  return typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(value);
}

export function publicFavoriteId(kind:FavoriteKind,value:unknown):string|null {
  if(kind==='competition')return isCompetitionSlug(value)?value:null;
  return isPublicId(value)?value.toLowerCase():null;
}

export function uniqueIds(values:readonly unknown[],kind:FavoriteKind):string[] {
  const seen=new Set<string>(),out:string[]=[];
  for(const value of values){
    const id=publicFavoriteId(kind,value);
    if(!id||seen.has(id))continue;
    seen.add(id);out.push(id);
    if(out.length>=FAVORITE_LIMIT)break;
  }
  return out;
}
