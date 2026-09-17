import {currentUser} from '@/auth/session';
import {isInterfaceLocale} from '@/localization/interface';
import {favoritesRepository} from './database';
import {parseGuestFavorites} from './guest';
import {type FavoriteKind,publicFavoriteId} from './identity';
import {privateCacheHeaders,sameOrigin} from './origin';

const kinds=new Set<FavoriteKind>(['team','competition','fixture']);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:privateCacheHeaders});

export async function getFavorites():Promise<Response> {
  const user=await currentUser();
  if(!user?.id)return json({authenticated:false,teams:[],competitions:[],fixtures:[],providerRequests:0});
  try{
    const favorites=await favoritesRepository().listPublic(user.id);
    return json({authenticated:true,...favorites,providerRequests:0});
  }catch{
    return json({error:'FAVORITES_UNAVAILABLE',providerRequests:0},503);
  }
}

export async function mutateFavorite(request:Request):Promise<Response> {
  if(!sameOrigin(request))return json({error:'FORBIDDEN',providerRequests:0},403);
  const user=await currentUser();
  if(!user?.id)return json({error:'UNAUTHENTICATED',providerRequests:0},401);
  let body:unknown;
  try{body=await request.json();}catch{return json({error:'INVALID',providerRequests:0},400);}
  const record=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
  const kind=record.kind,id=publicFavoriteId(kinds.has(kind as FavoriteKind)?kind as FavoriteKind:'team',record.id);
  if(!kinds.has(kind as FavoriteKind)||!id||typeof record.favorited!=='boolean'||'userId' in record||'user_id' in record)return json({error:'INVALID',providerRequests:0},400);
  try{
    const result=await favoritesRepository().setFavorite(user.id,kind as FavoriteKind,id,record.favorited);
    if(!result.ok)return json({error:result.error,providerRequests:0},result.error==='LIMIT'?409:result.error==='NOT_FOUND'?404:400);
    return json({ok:true,kind,id,favorited:result.favorited,providerRequests:0});
  }catch{
    return json({error:'FAVORITES_UNAVAILABLE',providerRequests:0},503);
  }
}

export async function mergeFavorites(request:Request):Promise<Response> {
  if(!sameOrigin(request))return json({error:'FORBIDDEN',providerRequests:0},403);
  const user=await currentUser();
  if(!user?.id)return json({error:'UNAUTHENTICATED',providerRequests:0},401);
  let body:unknown;
  try{body=await request.json();}catch{return json({error:'INVALID',providerRequests:0},400);}
  try{
    const result=await favoritesRepository().mergePublic(user.id,parseGuestFavorites(body));
    return json({ok:true,authenticated:true,...result.favorites,skipped:result.skipped,providerRequests:0});
  }catch{
    return json({error:'FAVORITES_UNAVAILABLE',providerRequests:0},503);
  }
}

export async function favoriteFeed(request:Request):Promise<Response> {
  if(!sameOrigin(request))return json({error:'FORBIDDEN',providerRequests:0},403);
  let body:unknown;
  try{body=await request.json();}catch{return json({error:'INVALID',providerRequests:0},400);}
  const record=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
  const locale=record.locale;
  if(!isInterfaceLocale(locale))return json({error:'INVALID',providerRequests:0},400);
  const guest=parseGuestFavorites({version:1,teams:record.teams,competitions:record.competitions,fixtures:record.fixtures});
  try{
    const rows=await favoritesRepository().feed(locale,guest);
    return json({rows,providerRequests:0});
  }catch{
    return json({error:'FAVORITES_UNAVAILABLE',providerRequests:0},503);
  }
}
