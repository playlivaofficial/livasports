import 'server-only';
import Link from '@/sports/SportsLink';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {InterfaceLocale} from '@/localization/interface';

type Surface={kind:'HOME'}|{kind:'DAILY'}|{kind:'COMPETITION';slug:string}|{kind:'TEAM';teamId:string}|{kind:'MATCH';fixtureId:string};
interface PriorityLink {fixtureId:string;rank:number;score:number;canonicalUrl:string;context:string;competition:string;kickoff:string;home:string;away:string;current:boolean;}

async function readPriorityLinks(surface:Surface):Promise<PriorityLink[]>{
  const url=databaseUrl();if(!url)return [];const db=new PostgresDatabaseClient(url);
  try{
    const common=`SELECT p.fixture_id,p.priority_rank,p.priority_score,p.canonical_url,p.context_pt_br,c.display_name_pt_br AS competition,
      f.kickoff,ht.name AS home,at.name AS away FROM growth_seo_priorities p JOIN fixtures f ON f.id=p.fixture_id
      JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE p.active`;
    let query:string,values:unknown[];
    if(surface.kind==='HOME'||surface.kind==='DAILY'){query=`${common} AND p.placements ? $1 ORDER BY p.priority_rank LIMIT 5`;values=[surface.kind];}
    else if(surface.kind==='COMPETITION'){query=`${common} AND p.placements ? 'COMPETITION' AND c.slug=$1 ORDER BY p.priority_rank LIMIT 5`;values=[surface.slug];}
    else if(surface.kind==='TEAM'){query=`${common} AND (p.placements ? 'HOME_TEAM' OR p.placements ? 'AWAY_TEAM') AND (f.home_team_id=$1 OR f.away_team_id=$1) ORDER BY p.priority_rank LIMIT 5`;values=[surface.teamId];}
    else {query=`${common} AND (p.fixture_id=$1 OR f.competition_id=(SELECT competition_id FROM fixtures WHERE id=$1)
      OR f.home_team_id IN(SELECT home_team_id FROM fixtures WHERE id=$1 UNION SELECT away_team_id FROM fixtures WHERE id=$1)
      OR f.away_team_id IN(SELECT home_team_id FROM fixtures WHERE id=$1 UNION SELECT away_team_id FROM fixtures WHERE id=$1))
      ORDER BY (p.fixture_id=$1) DESC,p.priority_rank LIMIT 4`;values=[surface.fixtureId];}
    const matchId=surface.kind==='MATCH'?surface.fixtureId:null,rows=(await db.query<Record<string,unknown>>(query,values)).rows;
    return rows.map(row=>({fixtureId:String(row.fixture_id),rank:Number(row.priority_rank),score:Number(row.priority_score),canonicalUrl:String(row.canonical_url),
      context:String(row.context_pt_br),competition:String(row.competition),kickoff:new Date(String(row.kickoff)).toISOString(),home:String(row.home),away:String(row.away),
      current:matchId!==null&&String(row.fixture_id)===matchId}));
  }catch(error){const code=(error as {code?:string}).code;if(code==='42P01'||code==='42703')return [];throw error;}finally{await db.close();}
}

/** Explicit, visible links only. Normal board chronology remains untouched. */
export async function GrowthProminence({locale,surface}:{locale:InterfaceLocale;surface:Surface}){
  if(locale!=='br')return null;const rows=await readPriorityLinks(surface).catch(()=>[]);if(!rows.length)return null;
  const current=rows.find(row=>row.current),links=rows.filter(row=>!row.current);
  return <section className="growth-prominence" aria-labelledby={`growth-priority-${surface.kind.toLowerCase()}`}>
    <header><span>Em destaque no LivaSports</span><h2 id={`growth-priority-${surface.kind.toLowerCase()}`}>{surface.kind==='MATCH'?'Contexto e próximos destaques':'Partidas para acompanhar'}</h2></header>
    {current?.context?<p className="growth-prominence-context">{current.context}</p>:null}
    {links.length?<div className="growth-prominence-links">{links.map(row=><Link key={row.fixtureId} href={new URL(row.canonicalUrl).pathname}>
      <span>#{row.rank} · {row.competition}</span><strong>{row.home} × {row.away}</strong><time dateTime={row.kickoff}>{new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(row.kickoff))}</time>
    </Link>)}</div>:null}
  </section>;
}
