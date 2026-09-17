import 'server-only';
import {authDatabase} from '@/auth/database';
import {FavoritesRepository} from './repository';

export function favoritesRepository():FavoritesRepository {
  return new FavoritesRepository(authDatabase());
}
