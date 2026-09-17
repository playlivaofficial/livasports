import {favoriteFeed} from '@/favorites/http';

export const dynamic='force-dynamic';

export function POST(request:Request):Promise<Response> {
  return favoriteFeed(request);
}
