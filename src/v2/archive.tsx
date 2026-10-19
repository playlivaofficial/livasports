import 'server-only';
import {cache} from 'react';
import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound,permanentRedirect} from 'next/navigation';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {interfaceLocales,languageTags,matchPath,teamPath,playerPath,type InterfaceLocale} from '@/localization/interface';
import {parseMatchParam} from '@/match-center/routes';
import {localizedAlternates} from '@/seo/policy';
import {V2Shell} from './pages';
import {tr,translated} from './content';
import {v2Path} from './routes';
import {v2Copy} from './copy';
type Kind='match'|'team'|'player';
type Row=Record<string,unknown>;
const copy={title:tr('Historical record','Registro histórico','Registro histórico'),notice:tr('This is a preserved snapshot, not current coverage. Live scores, odds and recurring sports-data updates have been retired.','Esta es una instantánea conservada, no cobertura actual. Se retiraron los marcadores en vivo, las cuotas y las actualizaciones deportivas periódicas.','Este é um registro preservado, não uma cobertura atual. Placares ao vivo, odds e atualizações esportivas recorrentes foram desativados.'),updated:tr('Last stored update','Última actualización guardada','Última atualização salva'),result:tr('Stored final result','Resultado final guardado','Resultado final salvo'),pending:tr('No final result in the archived record. The stored schedule is not a current fixture confirmation.','El registro no contiene un resultado final. El calendario guardado no confirma un partido actual.','O registro não contém resultado final. O calendário salvo não confirma uma partida atual.'),history:tr('Stored completed matches','Partidos finalizados guardados','Partidas encerradas salvas'),born:tr('Date of birth','Fecha de nacimiento','Data de nascimento'),founded:tr('Founded','Fundación','Fundação'),position:tr('Stored position','Posición guardada','Posição salva')};

/** Parameterized, read-only archive; at most two bounded queries on an uncached identity.
 * No sports runtime loader, freshness poll, image provider or mutation is imported. */
const readArchive=cache(async(kind:Kind,id:string):Promise<{row:Row;history:Row[]}|null>=>{
  const connection=databaseUrl();if(!connection)return null;
  const db=new PostgresDatabaseClient(connection,()=>undefined,{statementTimeoutMs:5000});
  try{
    if(kind==='match'){
      const row=(await db.query<Row>(`SELECT f.public_id,f.kickoff,f.status,f.home_score,f.away_score,f.updated_at,
        c.slug AS competition_slug,c.display_name_pt_br,c.display_name_es_mx,ht.name AS home,at.name AS away,
        ht.public_id AS home_id,at.public_id AS away_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id
        JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE f.public_id=$1`,[id])).rows[0];
      return row?{row,history:[]}:null;
    }
    if(kind==='team'){
      const row=(await db.query<Row>('SELECT id,public_id,name,founded_year,updated_at FROM teams WHERE public_id=$1',[id])).rows[0];if(!row)return null;
      const history=(await db.query<Row>(`SELECT f.public_id,f.kickoff,f.home_score,f.away_score,ht.name AS home,at.name AS away
        FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
        WHERE (f.home_team_id=$1 OR f.away_team_id=$1) AND f.status='FINISHED' AND f.home_score IS NOT NULL AND f.away_score IS NOT NULL
        ORDER BY f.kickoff DESC,f.public_id LIMIT 10`,[row.id])).rows;
      return {row,history};
    }
    const row=(await db.query<Row>('SELECT public_id,display_name AS name,date_of_birth::text AS date_of_birth,position_name,updated_at FROM players WHERE public_id=$1',[id])).rows[0];
    return row?{row,history:[]}:null;
  }finally{await db.close();}
});
const date=(value:unknown,locale:InterfaceLocale)=>new Intl.DateTimeFormat(languageTags[locale],{dateStyle:'long',timeZone:'UTC'}).format(new Date(String(value)));
const archivePath=(locale:InterfaceLocale,kind:Kind,row:Row)=>kind==='match'?matchPath(locale,String(row.public_id),String(row.home),String(row.away)):kind==='team'?teamPath(locale,String(row.public_id),String(row.name)):playerPath(locale,String(row.public_id),String(row.name));
async function resolve(kind:Kind,param:string){const parsed=parseMatchParam(param);if(!parsed)notFound();const result=await readArchive(kind,parsed.publicId);if(!result)notFound();return result;}
export async function archiveMetadata(locale:InterfaceLocale,kind:Kind,param:string):Promise<Metadata>{
  const {row,history}=await resolve(kind,param),name=kind==='match'?`${row.home} – ${row.away}`:String(row.name);
  const paths=Object.fromEntries(interfaceLocales.map(value=>[value,archivePath(value,kind,row)])) as Record<InterfaceLocale,string>;
  const substantive=kind==='match'?row.status==='FINISHED'&&row.home_score!==null&&row.away_score!==null:kind==='team'?history.length>0:Boolean(row.date_of_birth&&row.position_name);
  return {title:`${name} · ${translated(copy.title,locale)}`,description:translated(copy.notice,locale),alternates:localizedAlternates(locale,paths),...(!substantive?{robots:{index:false,follow:true}}:{})};
}
export async function ArchivePage({locale,kind,param}:{locale:InterfaceLocale;kind:Kind;param:string}){
  const {row,history}=await resolve(kind,param),path=archivePath(locale,kind,row);if(path.split('/').at(-1)!==param)permanentRedirect(path);
  const text=v2Copy(locale),finished=row.status==='FINISHED'&&row.home_score!==null&&row.away_score!==null;
  return <V2Shell locale={locale}><div className="v2-page-heading"><span className="v2-eyebrow">{translated(copy.title,locale)}</span><h1>{kind==='match'?`${row.home} – ${row.away}`:String(row.name)}</h1><p>{translated(copy.notice,locale)}</p></div><article className="v2-prose"><p><small>{translated(copy.updated,locale)}: <time dateTime={new Date(String(row.updated_at)).toISOString()}>{date(row.updated_at,locale)}</time></small></p>
    {kind==='match'?<><h2>{locale==='br'?String(row.display_name_pt_br):String(row.display_name_es_mx)}</h2><p>{date(row.kickoff,locale)} · UTC</p>{finished?<p><strong>{translated(copy.result,locale)}: {Number(row.home_score)} – {Number(row.away_score)}</strong></p>:<p>{translated(copy.pending,locale)}</p>}<ul><li><Link href={teamPath(locale,String(row.home_id),String(row.home))}>{String(row.home)}</Link></li><li><Link href={teamPath(locale,String(row.away_id),String(row.away))}>{String(row.away)}</Link></li></ul></>:null}
    {row.founded_year?<p>{translated(copy.founded,locale)}: {String(row.founded_year)}</p>:null}{row.date_of_birth?<p>{translated(copy.born,locale)}: {date(row.date_of_birth,locale)}</p>:null}{row.position_name?<p>{translated(copy.position,locale)}: {String(row.position_name)}</p>:null}
    {history.length?<section><h2>{translated(copy.history,locale)}</h2><ul>{history.map(match=><li key={String(match.public_id)}><Link href={matchPath(locale,String(match.public_id),String(match.home),String(match.away))}>{String(match.home)} {Number(match.home_score)} – {Number(match.away_score)} {String(match.away)}</Link><br/><small>{date(match.kickoff,locale)}</small></li>)}</ul></section>:null}
    <h2>{text.related}</h2><p><Link href={v2Path(locale,'football')}>{text.explore} →</Link></p><p><Link href={v2Path(locale,'tools','lineup-builder')}>{text.lineup} →</Link></p></article></V2Shell>;
}
