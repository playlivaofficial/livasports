import {getFavorites,mutateFavorite} from '@/favorites/http';

export const dynamic='force-dynamic';

export function GET():Promise<Response> {
  return getFavorites();
}

export function POST(request:Request):Promise<Response> {
  return mutateFavorite(request);
}
