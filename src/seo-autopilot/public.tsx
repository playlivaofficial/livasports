import 'server-only';
import {cache} from 'react';
import Link from '@/sports/SportsLink';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {MatchCenterView} from '@/match-center/types';
import {factualMatchContent} from './content';
import type {SeoLink} from './policy';

let db:PostgresDatabaseClient|undefined;
function database(){const url=databaseUrl();return url?(db??=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:3000})):null;}
export const readPublishedSeo=cache(async(fixtureId:string)=>{
  try{return (await database()?.query(`SELECT state,links,title,description,metadata_changed_at,retain_indexable FROM seo_autopilot_pages WHERE fixture_id=$1 AND state='PUBLISHED'`,[fixtureId]))?.rows[0]??null;}
  catch{return null;} // Additive release: missing migration/database never breaks the product page.
});
export async function SeoFactualContext({match,locale}:{match:MatchCenterView;locale:string}){
  if(locale!=='br')return null;
  const row=await readPublishedSeo(match.header.id);if(!row)return null;
  const content=factualMatchContent(match);
  return <section className="growth-prominence" data-seo-autopilot="factual-context"><h2>Dados para acompanhar o confronto</h2>
    {content.paragraphs.map(p=><p key={p}>{p}</p>)}
    <nav className="growth-context-links" aria-label="Jogos, equipes e retrospecto">
      {[...(row.links as SeoLink[]),...content.h2hLinks].map(l=><Link key={l.href} href={l.href}>{l.label}</Link>)}
    </nav></section>;
}
export type SeoSurface={kind:'HOME'}|{kind:'DAILY'}|{kind:'COMPETITION';slug:string}|{kind:'TEAM';teamId:string}|{kind:'MATCH';fixtureId:string};
export async function SeoPriorityLinks({locale,surface}:{locale:string;surface:SeoSurface}){
  if(locale!=='br'||surface.kind==='MATCH')return null;
  const condition=surface.kind==='COMPETITION'?'c.slug=$1':surface.kind==='TEAM'?'(f.home_team_id=$1 OR f.away_team_id=$1)':'true';
  const values=surface.kind==='COMPETITION'?[surface.slug]:surface.kind==='TEAM'?[surface.teamId]:[];
  let rows;
  try{rows=(await database()?.query(`SELECT p.url,ht.name AS home,at.name AS away,c.display_name_pt_br AS competition
    FROM seo_autopilot_pages p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE (p.state='PUBLISHED' OR (p.state='RETRYABLE_DATA_GAP' AND p.reasons='["INSUFFICIENT_INBOUND_LINKS"]'::jsonb))
      AND c.enabled AND f.status IN('SCHEDULED','FINISHED') AND f.kickoff>now()-interval '30 days' AND ${condition}
    ORDER BY p.score DESC,f.kickoff LIMIT 3`,values))?.rows??[];}catch{return null;}
  if(!rows.length)return null;
  return <section className="growth-prominence" data-seo-autopilot="priority-links"><h2>Confrontos em foco</h2>
    <div className="growth-prominence-links">{rows.map(r=><Link key={String(r.url)} href={new URL(String(r.url)).pathname}>
      <span>{String(r.competition)}</span><strong>{String(r.home)} x {String(r.away)}</strong>
    </Link>)}</div></section>;
}
