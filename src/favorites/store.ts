'use client';
import {useCallback,useSyncExternalStore} from 'react';
import {EMPTY_FAVORITES,type FavoriteKind,type GuestFavorites} from './identity';
import {favoriteKey} from './feed';
import {hasGuestFavorites,parseGuestFavorites,readGuestFavorites,toggleGuestFavorite,writeGuestFavorites} from './guest';

export interface FavoritesClientState {
  ready:boolean;
  authenticated:boolean;
  teams:ReadonlySet<string>;
  competitions:ReadonlySet<string>;
  fixtures:ReadonlySet<string>;
  pending:ReadonlySet<string>;
  error:string|null;
}

const listeners=new Set<()=>void>();
let state:FavoritesClientState={ready:false,authenticated:false,teams:new Set(),competitions:new Set(),fixtures:new Set(),pending:new Set(),error:null};

function emit(next:FavoritesClientState){state=next;for(const listener of listeners)listener();}

function snapshot(favorites:GuestFavorites,partial:Partial<FavoritesClientState>={}):FavoritesClientState {
  return {
    ready:true,
    authenticated:state.authenticated,
    teams:new Set(favorites.teams),
    competitions:new Set(favorites.competitions),
    fixtures:new Set(favorites.fixtures),
    pending:new Set(state.pending),
    error:null,
    ...partial,
  };
}

export function getFavoritesSnapshot():FavoritesClientState {return state;}
export function subscribeFavorites(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}

export function useFavoritesState():FavoritesClientState {
  return useSyncExternalStore(subscribeFavorites,getFavoritesSnapshot,getFavoritesSnapshot);
}

function currentGuest():GuestFavorites {
  return {version:1,teams:[...state.teams],competitions:[...state.competitions],fixtures:[...state.fixtures]};
}

function applyGuest(next:GuestFavorites,partial:Partial<FavoritesClientState>={}) {
  if(typeof window!=='undefined')writeGuestFavorites(window.localStorage,next);
  emit(snapshot(next,partial));
}

export function hydrateGuestFavorites() {
  if(typeof window==='undefined')return;
  emit(snapshot(readGuestFavorites(window.localStorage),{authenticated:false,ready:true}));
}

export function applyAccountFavorites(favorites:GuestFavorites|Record<'teams'|'competitions'|'fixtures',string[]>,authenticated=true) {
  emit(snapshot(parseGuestFavorites({version:1,...favorites}),{authenticated,ready:true,error:null}));
}

export function markFavoritesError(message:string|null) {
  emit({...state,error:message});
}

export function clearGuestFavoritesLocally() {
  applyGuest(EMPTY_FAVORITES,{authenticated:state.authenticated});
}

export function isFavorited(kind:FavoriteKind,id:string):boolean {
  return (kind==='team'?state.teams:kind==='competition'?state.competitions:state.fixtures).has(id);
}

export async function toggleFavorite(kind:FavoriteKind,id:string,next:boolean,onError:string):Promise<boolean> {
  const key=favoriteKey(kind,id);
  const previous=currentGuest();
  const pending=new Set(state.pending);pending.add(key);
  const optimistic=toggleGuestFavorite(previous,kind,id,next);
  emit(snapshot(optimistic,{pending,error:null,authenticated:state.authenticated,ready:true}));
  if(!state.authenticated){
    if(typeof window!=='undefined')writeGuestFavorites(window.localStorage,optimistic);
    pending.delete(key);
    emit({...getFavoritesSnapshot(),pending:new Set(pending)});
    return true;
  }
  try{
    const response=await fetch('/api/favorites',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({kind,id,favorited:next})});
    pending.delete(key);
    if(!response.ok){
      emit(snapshot(previous,{pending:new Set(pending),error:onError,authenticated:true,ready:true}));
      return false;
    }
    emit(snapshot(optimistic,{pending:new Set(pending),error:null,authenticated:true,ready:true}));
    return true;
  }catch{
    pending.delete(key);
    emit(snapshot(previous,{pending:new Set(pending),error:onError,authenticated:true,ready:true}));
    return false;
  }
}

export function useFavorite(kind:FavoriteKind,id:string) {
  const snapshotState=useFavoritesState();
  const favorited=(kind==='team'?snapshotState.teams:kind==='competition'?snapshotState.competitions:snapshotState.fixtures).has(id);
  const pending=snapshotState.pending.has(favoriteKey(kind,id));
  const toggle=useCallback((next:boolean,onError:string)=>toggleFavorite(kind,id,next,onError),[kind,id]);
  return {favorited,pending,ready:snapshotState.ready,error:snapshotState.error,toggle};
}

export function guestFavoritesPresent():boolean {
  return hasGuestFavorites(currentGuest());
}
