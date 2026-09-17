'use client';
import {useEffect} from 'react';
import {FAVORITE_STORAGE_KEY} from './identity';
import {hasGuestFavorites,parseGuestFavorites,writeGuestFavorites} from './guest';
import {applyAccountFavorites,hydrateGuestFavorites,markFavoritesError} from './store';

export function FavoritesSync(){
  useEffect(()=>{
    let cancelled=false;
    hydrateGuestFavorites();
    fetch('/api/favorites',{credentials:'same-origin'}).then(response=>response.ok?response.json():null).then(async body=>{
      if(cancelled||!body)return;
      if(!body.authenticated){hydrateGuestFavorites();return;}
      const guest=typeof window==='undefined'?null:parseGuestFavorites(window.localStorage.getItem(FAVORITE_STORAGE_KEY));
      if(guest&&hasGuestFavorites(guest)){
        const merged=await fetch('/api/favorites/merge',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(guest)});
        if(!merged.ok){applyAccountFavorites(body,true);markFavoritesError('merge');return;}
        const next=await merged.json();
        if(cancelled)return;
        writeGuestFavorites(window.localStorage,{version:1,teams:[],competitions:[],fixtures:[]});
        applyAccountFavorites(next,true);
        return;
      }
      applyAccountFavorites(body,true);
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[]);
  return null;
}
