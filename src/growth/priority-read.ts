import type {QueryExecutor} from '@/database/client';
import type {CoreGeo} from '@/config/geo';

/** Small DB-only read shared by product and ingestion repository code.
 * No renderer, provider or server-component imports: CLI ingestion remains usable.
 * Never scores separately or exposes an expired snapshot.
 */
export async function readGeoPriorityRanks(db:QueryExecutor,geo:CoreGeo,now=new Date()):Promise<Map<string,number>>{
  const rows=(await db.query(`SELECT p.fixture_id,p.priority_rank FROM growth_geo_priorities p JOIN fixtures f ON f.id=p.fixture_id
    JOIN competitions c ON c.id=f.competition_id WHERE p.geo=$1 AND p.active AND f.status='SCHEDULED' AND c.enabled
    AND f.kickoff>$2 AND f.kickoff<=$2::timestamptz+interval '7 days' ORDER BY p.priority_rank LIMIT 5`,[geo,now])).rows;
  return new Map(rows.map(r=>[String(r.fixture_id),Number(r.priority_rank)]));
}
