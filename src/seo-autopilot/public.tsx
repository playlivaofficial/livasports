import {geoForLocale,isCoreGeo} from '@/config/geo';
import {isInterfaceLocale,type InterfaceLocale,languageAlternates,languageTags} from '@/localization/interface';
import {isFinishedMatchDecayed} from '@/seo/policy';
import 'server-only';
import {cache} from 'react';
import Link from '@/sports/SportsLink';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {MatchCenterView} from '@/match-center/types';
import {factualMatchContent} from './content';
import type {SeoLink} from './policy';

let db:PostgresDatabaseClient|undefined;
function database(){const url=databaseUrl();return url?(db??=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:3000})):null;}
export const readPublishedSeo=cache(async(fixtureId:string,locale:InterfaceLocale='br')=>{
  try{return (await database()?.query(`SELECT state,links,title,description,metadata_changed_at,retain_indexable,
    to_jsonb(p)->'optimization_metadata' AS optimization_metadata,
    CASE WHEN (to_jsonb(p)->>'link_boost_until')::timestamptz>now() THEN to_jsonb(p)->>'intent_focus' END AS intent_focus
    FROM seo_all_pages p WHERE fixture_id=$1 AND locale=$2 AND state='PUBLISHED'`,[fixtureId,locale]))?.rows[0]??null;}
  catch{return null;} // Additive release: missing migration/database never breaks the product page.
});
export async function SeoFactualContext({match,locale}:{match:MatchCenterView;locale:string}){
  if(!isInterfaceLocale(locale)||locale==='en')return null;
  const row=await readPublishedSeo(match.header.id,locale);if(!row)return null;
  const content=factualMatchContent(match,locale);
  // Only reorders already-verified factual paragraphs; missing modules never gain invented text.
  const focused=focusFactualParagraphs(content.paragraphs,String(row.intent_focus??''));
  return <section className="growth-prominence" data-seo-autopilot="factual-context"><h2>{locale==='br'?'Dados para acompanhar o confronto':'Datos para seguir el partido'}</h2>
    {focused.map(p=><p className="growth-prominence-context" key={p}>{p}</p>)}
    <div className="growth-prominence-links"><nav className="growth-context-links" aria-label={locale==='br'?'Jogos, equipes e retrospecto':'Partidos, equipos e historial'}>
      {[...(row.links as SeoLink[]),...content.h2hLinks].map(l=><Link key={l.href} href={l.href}>{l.label}</Link>)}
    </nav></div></section>;
}
export function focusFactualParagraphs(paragraphs:string[],intent:string){
  const match=(p:string)=>intent==='H2H'?(p.startsWith('O retrospecto')||p.startsWith('El historial')):intent==='FORM'?(p.includes('resultados anteriores disponíveis')||p.includes('resultados anteriores disponibles')):false;
  // Keep fixture identity/date first. No unsupported standings claim or synthesized content.
  return [...paragraphs.slice(0,1),...paragraphs.slice(1).filter(match),...paragraphs.slice(1).filter(p=>!match(p))];
}
export type SeoSurface={kind:'HOME'}|{kind:'DAILY'}|{kind:'COMPETITION';slug:string}|{kind:'TEAM';teamId:string}|{kind:'MATCH';fixtureId:string};
export async function SeoPriorityLinks({locale,surface}:{locale:string;surface:SeoSurface}){
  if(!isCoreGeo(geoForLocale(locale))||surface.kind==='MATCH')return null;
  const condition=surface.kind==='COMPETITION'?'c.slug=$2':surface.kind==='TEAM'?'(f.home_team_id=$2 OR f.away_team_id=$2)':'true';
  const values=surface.kind==='COMPETITION'?[locale,surface.slug]:surface.kind==='TEAM'?[locale,surface.teamId]:[locale];
  let rows;
  try{rows=(await database()?.query(`SELECT p.url,ht.name AS home,at.name AS away,c.display_name_es_mx AS competition
    FROM seo_all_pages p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
    JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE (p.state='PUBLISHED' OR (p.state='RETRYABLE_DATA_GAP' AND p.reasons IN ('["INSUFFICIENT_INBOUND_LINKS"]'::jsonb,'["DAILY_PUBLICATION_CAP"]'::jsonb)))
      AND p.locale=$1 AND c.enabled AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<now()+interval '7 days' AND ${condition}
    ORDER BY p.score DESC,f.kickoff LIMIT 3`,values))?.rows??[];}catch{return null;}
  if(!rows.length)return null;
  return <section className="growth-prominence" data-seo-autopilot="priority-links"><h2>Partidos en foco</h2>
    <div className="growth-prominence-links">{rows.map(r=><Link key={String(r.url)} href={new URL(String(r.url)).pathname}>
      <span>{String(r.competition)}</span><strong>{String(r.home)} x {String(r.away)}</strong>
    </Link>)}</div></section>;
}

/** Reciprocal alternates may never point to an aged, noindex locale of the same fixture. */
const retainedLocales=cache(async(fixtureId:string)=>{
  try{return (await database()?.query("SELECT locale FROM seo_all_pages WHERE fixture_id=$1 AND state='PUBLISHED' AND retain_indexable",[fixtureId]))?.rows.map(r=>String(r.locale))??[];}catch{return [];}
});
export async function matchLanguageAlternates(fixtureId:string,status:string,kickoff:string,br:string,mx:string,en:string){
  const all=languageAlternates(br,mx,en);
  if(!isFinishedMatchDecayed(status,kickoff))return all;
  const retained=await retainedLocales(fixtureId),tags=retained.filter(isInterfaceLocale).map(locale=>languageTags[locale]);
  return Object.fromEntries(Object.entries(all).filter(([tag])=>tag==='x-default'?tags.includes('en'):tags.includes(tag as typeof tags[number])));
}
