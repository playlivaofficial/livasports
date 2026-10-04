import {requestTimeZone} from '@/localization/time-zone-server';
import {resolveTimeZone} from '@/localization/time-zone';
import {LocalizedTimeText} from '@/localization/LocalizedTime';
import Link from './SportsLink';
import type {Metadata} from 'next';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {interfaceDictionary,matchPath,type InterfaceLocale} from '@/localization/interface';
import {competitionName,competitionPath,sportStage,pendingParticipant} from './policy';
import type {PendingSportsFixture} from './types';
const copy={br:{title:'Equipes a definir',detail:'Este jogo consta no calendário oficial. Os participantes e o horário ainda aguardam confirmação.',back:'Ver competição'},mx:{title:'Equipos por definir',detail:'Este partido figura en el calendario oficial. Los participantes y la hora aún esperan confirmación.',back:'Ver competición'},en:{title:'Teams to be confirmed',detail:'This fixture is in the official schedule. Participants and kickoff time are awaiting confirmation.',back:'View competition'}};
export const pendingPath=(locale:InterfaceLocale,id:string)=>matchPath(locale,id,'fixture','pending');
export function pendingMetadata(locale:InterfaceLocale,row:PendingSportsFixture):Metadata{
  return {title:`${competitionName(locale,row.competitionSlug)} · ${copy[locale==='co'||locale==='pe'?'mx':locale].title}`,robots:{index:false,follow:true},alternates:{canonical:pendingPath(locale,row.publicId)}};
}
export async function PendingMatch({locale,row,timeZone=resolveTimeZone(locale,null,null)}:{locale:InterfaceLocale;row:PendingSportsFixture;timeZone?:string}){
  const t=copy[locale==='co'||locale==='pe'?'mx':locale],d=interfaceDictionary(locale);
  return <div className="app-shell" lang={d.locale}><SiteHeader locale={locale} activePage="football" contentId="pending-match"/><main className="page-container" id="pending-match"><div className="sports-hub-context"><Link href={competitionPath(locale,row.competitionSlug,{season:row.seasonId})}>{competitionName(locale,row.competitionSlug)}</Link><span>{row.season}</span></div><h1>{t.title}</h1>{row.home||row.away?<h2>{pendingParticipant(locale,row.home)} × {pendingParticipant(locale,row.away)}</h2>:null}<p className="sports-empty">{t.detail}</p>{row.kickoff?<p><LocalizedTimeText value={row.kickoff} locale={locale} options={{dateStyle:'long'}} fallbackTimeZone={timeZone}/></p>:null}{sportStage(locale,row.stage)?<p>{sportStage(locale,row.stage)}</p>:null}<Link href={competitionPath(locale,row.competitionSlug,{season:row.seasonId,tab:'fixtures'})}>{t.back} →</Link></main></div>;
}
export async function PendingRows({locale,rows}:{locale:InterfaceLocale;rows:PendingSportsFixture[]}){
  const timeZone=await requestTimeZone(locale);
  const d=interfaceDictionary(locale);
  return rows.length?<section><h2 className="sports-panel-title">{copy[locale==='co'||locale==='pe'?'mx':locale].title}</h2>{rows.map(r=><Link className="sports-pending-row" key={r.publicId} href={pendingPath(locale,r.publicId)}><span>{r.kickoff?new Intl.DateTimeFormat(d.locale,{dateStyle:'medium',timeZone}).format(new Date(r.kickoff)):copy[locale==='co'||locale==='pe'?'mx':locale].title}</span><strong>{pendingParticipant(locale,r.home)} × {pendingParticipant(locale,r.away)}{sportStage(locale,r.stage)?<small>{sportStage(locale,r.stage)}</small>:null}</strong><span aria-hidden="true">→</span></Link>)}</section>:null;
}
