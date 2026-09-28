import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {gscProperty} from './gsc';
import {gscWindows} from './gsc-ingest';
import {aggregate,collapse,type SearchRow} from './intelligence';
import {isFinishedMatchDecayed} from './policy';

const metric=(r:Record<string,unknown>):SearchRow=>({key:String(r.key),clicks:Number(r.clicks),impressions:Number(r.impressions),ctr:Number(r.ctr),position:Number(r.position)});
/** Bounded bulk reads, not one DB/network query per candidate. Recommendations never edit titles. */
export async function readCtrOpportunities(db:QueryExecutor,now=new Date()){
  const property=gscProperty(),w=gscWindows(now).current7,values=[property,w.from,w.to];
  const [raw,details,syncs]=await Promise.all([
    db.query(`SELECT key,clicks,impressions,ctr,position FROM seo_search_daily WHERE property=$1 AND dimension='PAGE' AND day BETWEEN $2 AND $3`,values),
    db.query(`SELECT page,dimension,key,clicks,impressions,ctr,position FROM seo_page_breakdowns WHERE property=$1 AND day BETWEEN $2 AND $3`,values),
    db.query(`SELECT DISTINCT ON(dimension) dimension,state,captured_at FROM seo_breakdown_syncs WHERE property=$1 AND from_day<=$2 AND to_day>=$3 ORDER BY dimension,captured_at DESC`,values),
  ]);
  const pages=collapse(raw.rows.map(metric)).filter(r=>r.impressions>=10).sort((a,b)=>b.impressions-a.impressions).slice(0,100);
  const ids=pages.map(p=>/-([a-f0-9]{16})$/.exec(p.key)?.[1]).filter(Boolean);
  const facts=(await db.query(`SELECT f.public_id,f.status,f.kickoff,c.slug,
      EXISTS(SELECT 1 FROM countries co WHERE co.iso2='BR' AND co.id IN(c.country_id,ht.country_id,at.country_id)) AS brazil
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE f.public_id=ANY($1::text[])
    UNION ALL SELECT t.public_id,NULL,NULL,NULL,co.iso2='BR' FROM teams t LEFT JOIN countries co ON co.id=t.country_id WHERE t.public_id=ANY($1::text[])`,[ids])).rows;
  return {from:w.from,to:w.to,breakdowns:syncs.rows.map(r=>({dimension:String(r.dimension),state:String(r.state),capturedAt:new Date(String(r.captured_at)).toISOString()})),
    pages:pages.map(page=>{
      const detail=details.rows.filter(r=>r.page===page.key),fact=facts.find(f=>page.key.endsWith(String(f.public_id)));
      const rows=(dimension:string)=>collapse(detail.filter(r=>r.dimension===dimension).map(metric)).sort((a,b)=>b.impressions-a.impressions);
      const country=rows('COUNTRY'),device=rows('DEVICE'),query=rows('QUERY');
      const decayed=fact?.status?isFinishedMatchDecayed(String(fact.status),String(fact.kickoff),now):false;
      return {...page,locale:new URL(page.key).pathname.split('/')[1],brazilRelevant:fact?.brazil===true,
        query:query[0]?.key??null,country:country[0]?.key??null,device:device[0]?.key??null,
        brazilImpressions:country.find(r=>r.key==='bra')?.impressions??null,mobileImpressions:device.find(r=>r.key==='MOBILE')?.impressions??null,
        eligible:!decayed&&page.impressions>=30&&page.position>=5&&page.position<=20&&page.ctr<.015,
        classification:decayed?'EXISTING_DECAY_POLICY':page.impressions<30?'LOW_SAMPLE':page.position>20?'VISIBILITY_BEFORE_CTR':'METADATA_REVIEW',
        indexability:decayed?'NOINDEX_BY_EXISTING_POLICY':'VERIFY_RENDERED_CANONICAL_AND_ROBOTS'};
    }),totals:aggregate(raw.rows.map(metric))};
}
export type CtrReport=Awaited<ReturnType<typeof readCtrOpportunities>>;
