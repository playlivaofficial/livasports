'use client';
import {useState} from 'react';
import Link from 'next/link';
import {teamPath,type InterfaceLocale} from '@/localization/interface';
import {TeamMark} from '@/components/sports/TeamMark';
import type {SportsStanding} from './types';
import {sportsCopy} from './copy';
import {unlinkedTeamLabel} from './unlinked-competition';
import {standingRule} from './standing-policy';
export function StandingsTable({locale,rows,label}:{locale:InterfaceLocale;rows:SportsStanding[];label:string}){
  const [view,setView]=useState<'overall'|'home'|'away'>('overall');const t=sportsCopy[locale];
  const labels=locale==='br'?{overall:'Geral',home:'Mandante',away:'Visitante',order:'Ordem da classificação geral'}:locale==='mx'?{overall:'General',home:'Local',away:'Visitante',order:'Orden de la clasificación general'}:{overall:'Overall',home:'Home',away:'Away',order:'Overall table order'};
  const splits=rows.some(r=>r.home.played!==null||r.away.played!==null);
  const rules=[...new Map(rows.flatMap(r=>{const rule=standingRule(locale,r.rule);return rule?[[rule.label,rule] as const]:[];})).values()];
  return <>{splits?<div className="sports-table-views" role="group" aria-label={t.standings}>{(['overall','home','away'] as const).map(key=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{labels[key]}</button>)}</div>:null}
    {view!=='overall'?<p className="sports-data-note">{labels.order}</p>:null}
    <div className="sports-table-scroll" tabIndex={0} role="region" aria-label={`${t.standings} ${label}`}><table className="sports-table"><caption className="sr-only">{label} · {labels[view]}</caption><thead><tr><th scope="col">#</th><th scope="col">{t.team}</th>{(['played','won','drawn','lost','gf','ga','gd','points'] as const).map(k=><th scope="col" key={k}>{t[k]}</th>)}{view==='overall'?<th scope="col">{t.form}</th>:null}</tr></thead><tbody>{rows.map(row=>{
      const r=view==='overall'?row:row[view];const rule=view==='overall'?standingRule(locale,row.rule):null;
      return <tr key={row.sourceKey??row.team?.id} data-rule={rule?.tone}><td title={rule?.label}>{row.position}{rule?<span className="sr-only"> · {rule.label}</span>:null}</td><th scope="row">{row.team?<Link prefetch={false} className="sports-team-link" href={teamPath(locale,row.team.publicId,row.team.name)}><TeamMark initials={row.team.name.slice(0,2)} imageUrl={row.team.imageUrl}/><span>{row.team.name}</span></Link>:<span className="sports-data-note">{unlinkedTeamLabel(locale)}</span>}</th>{[r.played,r.won,r.drawn,r.lost,r.goalsFor,r.goalsAgainst,r.goalDifference,r.points].map((v,i)=><td key={i}>{v??'—'}</td>)}{view==='overall'?<td><span className="sports-table-form">{row.form.map((v,i)=><span key={i} data-result={v} title={v==='W'?t.win:v==='D'?t.draw:t.loss}>{v==='W'?(locale==='en'?'W':locale==='br'?'V':'G'):v==='D'?(locale==='en'?'D':'E'):(locale==='en'?'L':locale==='br'?'D':'P')}</span>)}</span></td>:null}</tr>;
    })}</tbody></table></div>{rules.length&&view==='overall'?<div className="sports-rule-legend">{rules.map(rule=><span key={rule.label} data-rule={rule.tone}>{rule.label}</span>)}</div>:null}
  </>;
}
