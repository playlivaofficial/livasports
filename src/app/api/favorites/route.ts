import {getFavorites,mutateFavorite} from '@/favorites/http';
import {withRequestLimit} from '@/security/request-limit';

export const dynamic='force-dynamic';

export const GET=withRequestLimit('favorites',getFavorites);
export const POST=withRequestLimit('favorites',mutateFavorite);
