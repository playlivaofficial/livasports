import 'server-only';
import Link from '@/sports/SportsLink';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {InterfaceLocale} from '@/localization/interface';
import {teamPath} from '@/localization/interface';
import {requestTimeZone} from '@/localization/time-zone-server';
import {competitionPath} from '@/sports/policy';
import {geoForLocale,geoProfile,isCoreGeo,type CoreGeo} from '@/config/geo';

type Surface={kind:'HOME'}|{kind:'DAILY'}|{kind:'COMPETITION';slug:string}|{kind:'TEAM';teamId:string}|{kind:'MATCH';fixtureId:string};
interface PriorityLink {fixtureId:string;rank:number;score:number;canonicalUrl:string;context:string;competition:string;competitionSlug:string;kickoff:string;home:string;away:string;homePublicId:string;awayPublicId:string;current:boolean;}

async function readPriorityLinks(surface:Surface,geo:CoreGeo):Promise<PriorityLink[]>{
  const url=databaseUrl();if(!url)return [];const db=new PostgresDatabaseClient(url);
  try{
    const common=`SELECT p.fixture_id,p.priority_rank,p.priority_score,p.canonical_url,p.context_localized,c.display_name_es_mx AS competition,
      c.slug AS competition_slug,f.kickoff,ht.name AS home,at.name AS away,ht.public_id AS home_public_id,at.public_id AS away_public_id
      FROM growth_geo_priorities p JOIN fixtures f ON f.id=p.fixture_id
      JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE p.active AND p.geo=$2 AND c.enabled AND f.status='SCHEDULED' AND f.kickoff>now()
      AND f.kickoff<=now()+interval '7 days' AND NOT ht.provider_placeholder AND NOT at.provider_placeholder`;
    let query:string,values:unknown[];
    if(surface.kind==='HOME'||surface.kind==='DAILY'){query=`${common} AND p.placements ? $1 ORDER BY p.priority_rank LIMIT 5`;values=[surface.kind];}
    else if(surface.kind==='COMPETITION'){query=`${common} AND p.placements ? 'COMPETITION' AND c.slug=$1 ORDER BY p.priority_rank LIMIT 5`;values=[surface.slug];}
    else if(surface.kind==='TEAM'){query=`${common} AND (p.placements ? 'HOME_TEAM' OR p.placements ? 'AWAY_TEAM') AND (f.home_team_id=$1 OR f.away_team_id=$1) ORDER BY p.priority_rank LIMIT 5`;values=[surface.teamId];}
    else {query=`${common} AND (p.fixture_id=$1 OR f.competition_id=(SELECT competition_id FROM fixtures WHERE id=$1)
      OR f.home_team_id IN(SELECT home_team_id FROM fixtures WHERE id=$1 UNION SELECT away_team_id FROM fixtures WHERE id=$1)
      OR f.away_team_id IN(SELECT home_team_id FROM fixtures WHERE id=$1 UNION SELECT away_team_id FROM fixtures WHERE id=$1))
      ORDER BY (p.fixture_id=$1) DESC,p.priority_rank LIMIT 4`;values=[surface.fixtureId];}
    values.push(geo);
    const matchId=surface.kind==='MATCH'?surface.fixtureId:null,rows=(await db.query<Record<string,unknown>>(query,values)).rows.filter(row=>{
      try{const url=new URL(String(row.canonical_url));return url.origin==='https://livasports.com'&&url.pathname.startsWith(`/${geoProfile(geo).locale}/`);}catch{return false;}
    });
    return rows.map(row=>({fixtureId:String(row.fixture_id),rank:Number(row.priority_rank),score:Number(row.priority_score),canonicalUrl:String(row.canonical_url),
      context:String(row.context_localized),competition:String(row.competition),kickoff:new Date(String(row.kickoff)).toISOString(),home:String(row.home),away:String(row.away),
      competitionSlug:String(row.competition_slug),homePublicId:String(row.home_public_id),awayPublicId:String(row.away_public_id),
      current:matchId!==null&&String(row.fixture_id)===matchId}));
  }catch(error){const code=(error as {code?:string}).code;if(code==='42P01'||code==='42703')return [];throw error;}finally{await db.close();}
}

/** Explicit, visible links only. Normal board chronology remains untouched. */
export async function GrowthProminence({locale,surface}:{locale:InterfaceLocale;surface:Surface}){
  const geo=geoForLocale(locale);if(!isCoreGeo(geo))return null;
  const rows=await readPriorityLinks(surface,geo).catch(()=>[]);if(!rows.length)return null;
  const profile=geoProfile(geo),timeZone=await requestTimeZone(locale);
  const current=rows.find(row=>row.current),links=rows.filter(row=>!row.current);
  return <section className="growth-prominence" aria-labelledby={`growth-priority-${surface.kind.toLowerCase()}`}>
    <header><span>En foco · {profile.countryName}</span><h2 id={`growth-priority-${surface.kind.toLowerCase()}`}>{surface.kind==='MATCH'?'Contexto y próximos partidos':'Partidos para seguir'}</h2></header>
    {current?.context?<p className="growth-prominence-context">{current.context}</p>:null}
    {links.length?<div className="growth-prominence-links">{links.map(row=><div className="growth-prominence-item" key={row.fixtureId}><Link href={new URL(row.canonicalUrl).pathname}>
      <span>#{row.rank} · {row.competition}</span><strong>{row.home} × {row.away}</strong><time dateTime={row.kickoff} title={timeZone.replaceAll('_',' ')}>{new Intl.DateTimeFormat(profile.languageTag,{timeZone,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(row.kickoff))}</time>
    </Link><nav className="growth-context-links" aria-label={`Explorar ${row.home} x ${row.away}`}>
      <Link href={competitionPath(locale,row.competitionSlug)}>Competición</Link>
      <Link href={teamPath(locale,row.homePublicId,row.home)}>{row.home}</Link>
      <Link href={teamPath(locale,row.awayPublicId,row.away)}>{row.away}</Link>
    </nav></div>)}</div>:null}
  </section>;
}
