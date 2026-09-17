import type {SportsFixture} from '@/sports/types';
import type {FavoriteKind,FavoriteReason,GuestFavorites} from './identity';

export type MyMatchFilter='all'|'live'|'upcoming'|'results';

export interface MyMatchRow {
  fixture:SportsFixture;
  reason:FavoriteReason;
}

export function isLiveStatus(status:SportsFixture['status']):boolean {
  return status==='LIVE'||status==='HALFTIME';
}

export function favoriteReason(fixture:SportsFixture,favorites:GuestFavorites):FavoriteReason|null {
  if(favorites.fixtures.includes(fixture.publicId))return 'match';
  if(favorites.teams.includes(fixture.home.publicId)||favorites.teams.includes(fixture.away.publicId))return 'team';
  if(favorites.competitions.includes(fixture.competitionSlug))return 'competition';
  return null;
}

export function sortMyMatches(rows:readonly MyMatchRow[]):MyMatchRow[] {
  const rank=(status:SportsFixture['status'])=>isLiveStatus(status)?0:status==='SCHEDULED'||status==='POSTPONED'?1:status==='FINISHED'?2:3;
  return [...rows].sort((a,b)=>{
    const ra=rank(a.fixture.status),rb=rank(b.fixture.status);
    if(ra!==rb)return ra-rb;
    const ka=Date.parse(a.fixture.kickoff),kb=Date.parse(b.fixture.kickoff);
    if(ra===2)return kb-ka||a.fixture.id.localeCompare(b.fixture.id);
    return ka-kb||a.fixture.id.localeCompare(b.fixture.id);
  });
}

export function filterMyMatches(rows:readonly MyMatchRow[],view:MyMatchFilter):MyMatchRow[] {
  if(view==='all')return [...rows];
  if(view==='live')return rows.filter(row=>isLiveStatus(row.fixture.status));
  if(view==='upcoming')return rows.filter(row=>row.fixture.status==='SCHEDULED'||row.fixture.status==='POSTPONED');
  return rows.filter(row=>row.fixture.status==='FINISHED');
}

export function dedupeMyMatches(rows:readonly MyMatchRow[]):MyMatchRow[] {
  const seen=new Set<string>(),out:MyMatchRow[]=[];
  for(const row of rows){
    if(seen.has(row.fixture.id)||seen.has(row.fixture.publicId))continue;
    seen.add(row.fixture.id);seen.add(row.fixture.publicId);out.push(row);
  }
  return out;
}

export function emptyFavoritesPayload(){return {teams:[] as string[],competitions:[] as string[],fixtures:[] as string[]};}

export function favoriteKey(kind:FavoriteKind,id:string):string {
  return `${kind}:${id}`;
}
