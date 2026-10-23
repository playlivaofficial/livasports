import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {transitionNews,safeNewsDraft,resetTranslationReviews,canonicalSourceUrl,type NewsDraft,type NewsRecord,type PublishedNews} from './model';

const columns='slug,draft,published,revision,reviewed_revision AS "reviewedRevision",reviewed_at::text AS "reviewedAt",archived';
/** PostgreSQL timestamptz text differs from the ISO stamps held in JSONB translations. */
export function normalizeNewsRecord(row:NewsRecord):NewsRecord{
  return {...row,reviewedAt:row.reviewedAt?new Date(row.reviewedAt).toISOString():null};
}
export class NewsRepository {
  constructor(private db:DatabaseClient){}
  async listOwner(){return (await this.db.query<NewsRecord>(`SELECT ${columns} FROM editorial_news ORDER BY edited_at DESC LIMIT 200`)).rows.map(normalizeNewsRecord);}
  async listPublished():Promise<PublishedNews[]>{return (await this.db.query<{published:PublishedNews}>(`SELECT published FROM editorial_news WHERE published IS NOT NULL AND NOT archived ORDER BY published->>'sourcePublishedOn' DESC,slug LIMIT 120`)).rows.map(row=>row.published);}
  async findPublished(slug:string):Promise<PublishedNews|null>{return (await this.db.query<{published:PublishedNews}>('SELECT published FROM editorial_news WHERE slug=$1 AND published IS NOT NULL AND NOT archived',[slug])).rows[0]?.published??null;}
  async sitemap():Promise<PublishedNews[]>{return (await this.db.query<{published:PublishedNews}>('SELECT published FROM editorial_news WHERE published IS NOT NULL AND NOT archived ORDER BY slug LIMIT 5000')).rows.map(row=>row.published);}
  async mutate(input:{action:'create'|'save'|'review'|'publish'|'archive';slug:string;revision:number;draft?:NewsDraft},now=new Date()):Promise<NewsRecord>{
    return this.db.transaction(async db=>{
      // Serialize this tiny editorial write stream, including new slugs and its rate bound.
      await db.query('SELECT pg_advisory_xact_lock(724219)');
      const recent=await db.query<{count:string}>("SELECT count(*) FROM editorial_news_audit WHERE recorded_at>now()-interval '10 minutes'");
      if(Number(recent.rows[0]?.count)>100)throw new Error('RATE_LIMITED');
      let row=(await db.query<NewsRecord>(`SELECT ${columns} FROM editorial_news WHERE slug=$1 FOR UPDATE`,[input.slug])).rows[0];
      if(row)row=normalizeNewsRecord(row);
      if(input.action==='create'){
        if(row)throw new Error('REVISION_CONFLICT');
        if(!input.draft||input.draft.slug!==input.slug||!safeNewsDraft(input.draft))throw new Error('INVALID_DRAFT');
        row={slug:input.slug,draft:resetTranslationReviews(input.draft),published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
        await assertUniqueSource(db,row);
        await db.query('INSERT INTO editorial_news(slug,draft) VALUES ($1,$2)',[row.slug,JSON.stringify(row.draft)]);
      }else{
        if(!row)throw new Error('NOT_FOUND');
        if(input.revision!==row.revision)throw new Error('REVISION_CONFLICT');
        row=transitionNews(row,input.action,input.draft,now);
        if(input.action!=='archive')await assertUniqueSource(db,row);
        await db.query(`UPDATE editorial_news SET draft=$2,published=$3,revision=$4,reviewed_revision=$5,archived=$6,reviewed_at=$7,edited_at=now() WHERE slug=$1`,[row.slug,JSON.stringify(row.draft),row.published?JSON.stringify(row.published):null,row.revision,row.reviewedRevision,row.archived,row.reviewedAt]);
      }
      await audit(db,row,input.action);return row;
    });
  }
}
/** Runs under the same transaction/advisory lock as every newsroom mutation.
 * Includes archived records and both snapshots: an edited draft must not release
 * a source URL that is still referenced by its public version. Never LIMIT this check.
 */
async function assertUniqueSource(db:QueryExecutor,row:NewsRecord){
  const source=canonicalSourceUrl(row.draft.sourceUrl);if(!source)return;
  const existing=await db.query<{draftSource:string|null;publishedSource:string|null}>(`SELECT draft->>'sourceUrl' AS "draftSource",published->>'sourceUrl' AS "publishedSource" FROM editorial_news WHERE slug<>$1`,[row.slug]);
  if(existing.rows.some(item=>[item.draftSource,item.publishedSource].some(value=>canonicalSourceUrl(value)===source)))throw new Error('DUPLICATE_SOURCE');
}
async function audit(db:QueryExecutor,row:NewsRecord,action:string){await db.query('INSERT INTO editorial_news_audit(slug,action,revision,snapshot) VALUES ($1,$2,$3,$4)',[row.slug,action,row.revision,JSON.stringify(row)]);}
