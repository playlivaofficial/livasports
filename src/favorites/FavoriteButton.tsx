'use client';
import {favoritesCopy} from '@/localization/favorites-copy';
import type {InterfaceLocale} from '@/localization/interface';
import type {FavoriteKind} from './identity';
import {useFavorite} from './store';

export function FavoriteButton({locale,kind,id,className=''}:{locale:InterfaceLocale;kind:FavoriteKind;id:string;className?:string}){
  const text=favoritesCopy[locale];
  const {favorited,pending,toggle,error}=useFavorite(kind,id);
  if(!id)return null;
  const label=favorited?text.remove:text.add;
  return <button type="button" className={`favorite-toggle${favorited?' is-on':''}${pending?' is-pending':''}${error?' is-error':''}${className?` ${className}`:''}`}
    aria-pressed={favorited} aria-busy={pending||undefined} aria-label={pending?text.saving:label} title={pending?text.saving:label}
    disabled={pending} onClick={()=>{void toggle(!favorited,text.error);}}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 14.7 9l6 .9-4.4 4.2 1 5.9L12 17.3 6.7 20l1-5.9L3.3 9.9l6-.9z" fill={favorited?'currentColor':'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
  </button>;
}
