import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {transitionNews,safeNewsDraft,type NewsDraft,type NewsRecord,type PublishedNews} from './model';

const columns='slug,draft,published,revision,reviewed_revision AS "reviewedRevision",reviewed_at::text AS "reviewedAt",archived';
export class NewsRepository {
  constructor(private db:DatabaseClient){}
  async listOwner(){return (await this.db.query<NewsRecord>(`SELECT ${columns} FROM editorial_news ORDER BY edited_at DESC LIMIT 200`)).rows;}
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
      if(input.action==='create'){
        if(row)throw new Error('REVISION_CONFLICT');
        if(!input.draft||input.draft.slug!==input.slug||!safeNewsDraft(input.draft))throw new Error('INVALID_DRAFT');
        row={slug:input.slug,draft:input.draft,published:null,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
        await db.query('INSERT INTO editorial_news(slug,draft) VALUES ($1,$2)',[row.slug,JSON.stringify(row.draft)]);
      }else{
        if(!row)throw new Error('NOT_FOUND');
        if(input.revision!==row.revision)throw new Error('REVISION_CONFLICT');
        row=transitionNews(row,input.action,input.draft,now);
        await db.query(`UPDATE editorial_news SET draft=$2,published=$3,revision=$4,reviewed_revision=$5,archived=$6,reviewed_at=$7,edited_at=now() WHERE slug=$1`,[row.slug,JSON.stringify(row.draft),row.published?JSON.stringify(row.published):null,row.revision,row.reviewedRevision,row.archived,row.reviewedAt]);
      }
      await audit(db,row,input.action);return row;
    });
  }
}
async function audit(db:QueryExecutor,row:NewsRecord,action:string){await db.query('INSERT INTO editorial_news_audit(slug,action,revision,snapshot) VALUES ($1,$2,$3,$4)',[row.slug,action,row.revision,JSON.stringify(row)]);}
