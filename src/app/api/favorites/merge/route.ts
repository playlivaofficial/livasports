import {mergeFavorites} from '@/favorites/http';
import {withRequestLimit} from '@/security/request-limit';

export const dynamic='force-dynamic';

export const POST=withRequestLimit('favorites',mergeFavorites);
