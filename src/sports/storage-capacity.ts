import type {QueryExecutor} from '@/database/client';

/** Leave room for ordinary application writes; never change the hosting quota. */
export async function sportsStorageCapacity(db:QueryExecutor){
  const r=(await db.query<{limit_bytes:string|null;used_bytes:string}>(`
    SELECT CASE WHEN current_setting('neon.max_cluster_size',true) IS NULL OR current_setting('neon.max_cluster_size',true) LIKE '-%'
      THEN NULL ELSE pg_size_bytes(current_setting('neon.max_cluster_size',true)) END AS limit_bytes,
      (SELECT sum(pg_database_size(oid)) FROM pg_database WHERE has_database_privilege(oid,'CONNECT')) AS used_bytes`)).rows[0];
  const limit=r?.limit_bytes===null?null:Number(r?.limit_bytes),used=Number(r?.used_bytes);
  return {ready:limit===null||!Number.isFinite(limit)||limit<=0||used+32*1024*1024<limit,limitMiB:limit?Math.round(limit/1024/1024):null,usedMiB:Math.round(used/1024/1024)};
}
