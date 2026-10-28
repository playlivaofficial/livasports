import type {DatabaseClient} from '@/database/client';
export async function newsroomMetrics(db:DatabaseClient){
 const [publications,runs,rejections]=await Promise.all([
  db.query<{sport:string;today:number;sevenDays:number;live:number}>(`SELECT coalesce(published->>'sport','football') AS sport,
   count(*) FILTER(WHERE (published->>'publishedAt')::timestamptz>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today,
   count(*) FILTER(WHERE (published->>'publishedAt')::timestamptz>=now()-interval '7 days')::int AS "sevenDays",count(*)::int AS live
   FROM editorial_news WHERE published IS NOT NULL AND NOT archived GROUP BY 1 ORDER BY 1`),
  db.query<{completed:number;failed:number;duplicateBlocked:number;unchanged:number;modelMicroUsd:number}>(`SELECT count(*) FILTER(WHERE status='completed')::int AS completed,
   count(*) FILTER(WHERE status IN ('failed','abandoned'))::int AS failed,
   coalesce(sum((result->'candidates'->>'ownerOrDuplicateBlocked')::int),0)::int AS "duplicateBlocked",
   coalesce(sum((result->'candidates'->>'unchanged')::int),0)::int AS unchanged,
   coalesce(sum(model_microusd_used),0)::int AS "modelMicroUsd" FROM editorial_automation_runs WHERE started_at>=now()-interval '7 days'`),
  db.query<{editorial:number;quarantined:number}>(`SELECT count(*) FILTER(WHERE reason IN ('EDITORIAL_REVIEW_REQUIRED','EDITORIAL_REVIEW_FAILED','MODEL_CORRECTION_INVALID','MODEL_COPY_INVALID','MODEL_AUDIT_INVALID','DETERMINISTIC_VALIDATION_FAILED'))::int AS editorial,
   count(*)::int AS quarantined FROM editorial_automation_events WHERE state='review' AND changed_at>=now()-interval '7 days'`),
 ]);
 return {publications:publications.rows,runs:runs.rows[0],rejections:rejections.rows[0]};
}

