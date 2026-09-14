import {requestTimeZone} from '@/localization/time-zone-server';
import Link from 'next/link';
import {interfaceDictionary,matchPath,type InterfaceLocale} from '@/localization/interface';
import type {MatchHistoryView} from '@/match-center/types';
import {sportsCopy} from './copy';
export async function MatchHistory({title,rows,locale}:{title:string;rows:MatchHistoryView[];locale:InterfaceLocale}){
  const timeZone=await requestTimeZone(locale);
  const t=sportsCopy[locale],dictionary=interfaceDictionary(locale);
  const labels={W:locale==='br'?'V':locale==='mx'?'G':'W',D:locale==='en'?'D':'E',L:locale==='br'?'D':locale==='mx'?'P':'L'};
  const meanings={W:t.win,D:t.draw,L:t.loss};
  const row=(r:MatchHistoryView)=><Link prefetch={false} key={r.id} href={matchPath(locale,r.publicId,r.home,r.away)} className="sports-form-row"><span className={`form-result ${r.perspective??''}`} aria-label={r.perspective?meanings[r.perspective]:undefined}>{r.perspective?labels[r.perspective]:'—'}</span><span><small><time dateTime={r.kickoff}>{new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'short',timeZone}).format(new Date(r.kickoff))}</time></small>{r.home} <b>{r.homeScore??'—'}–{r.awayScore??'—'}</b> {r.away}</span></Link>;
  return <div className="form-block sports-history-group"><h3>{title} <small>{rows.length}</small></h3>{rows.length?<>{rows.slice(0,5).map(row)}{rows.length>5?<details><summary>{t.more} ({rows.length-5})</summary>{rows.slice(5).map(row)}</details>:null}</>:<p className="sports-empty">{t.noResults}</p>}</div>;
}
