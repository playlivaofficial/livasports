import 'server-only';
import {authDatabase} from '@/auth/database';
import {isUuid} from '@/favorites/identity';
import {competitionName} from '@/sports/policy';
import type {InterfaceLocale} from '@/localization/interface';
import type {StoredFavorite} from './SavedRecords';
export async function savedAccountRecords(userId:string,locale:InterfaceLocale):Promise<StoredFavorite[]>{
 if(!isUuid(userId))return [];
 const {rows}=await authDatabase().query<{kind:StoredFavorite['kind'];id:string;name:string}>(`SELECT kind,id,name FROM (
  SELECT 'team' AS kind,t.public_id AS id,t.name,f.created_at FROM user_favorite_teams f JOIN teams t ON t.id=f.team_id WHERE f.user_id=$1
  UNION ALL SELECT 'fixture',m.public_id,ht.name||' – '||at.name,f.created_at FROM user_favorite_fixtures f JOIN fixtures m ON m.id=f.fixture_id JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id WHERE f.user_id=$1
  UNION ALL SELECT 'competition',c.slug,c.slug,f.created_at FROM user_favorite_competitions f JOIN competitions c ON c.id=f.competition_id WHERE f.user_id=$1
 ) saved ORDER BY created_at,id LIMIT 150`,[userId]);
 return rows.map(row=>({...row,name:row.kind==='competition'?competitionName(locale,row.id)??row.name:row.name}));
}
