import type {MatchCenterView} from '@/match-center/types';
import {matchPath,type InterfaceLocale} from '@/localization/interface';
import {geoForLocale,geoProfile} from '@/config/geo';
import {localizedCompetitionName} from '@/sports/match-seo';

/** Factual PT-BR only. Recomputed from the same read model as the visible Match Center. */
export function factualMatchContent(match:Pick<MatchCenterView,'header'|'form'|'standings'|'statistics'>,locale:InterfaceLocale='br'){
  if(locale!=='br')return spanishFactualContent(match,locale);
  const h=match.header,paragraphs:string[]=[];
  const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long',timeStyle:'short'}).format(new Date(h.kickoff));
  const finished=h.status==='FINISHED'&&h.homeScore!==null&&h.awayScore!==null;
  if(finished)paragraphs.push(`${h.home.name} ${h.homeScore} x ${h.awayScore} ${h.away.name}: resultado registrado em ${h.competition}, em ${date} (horário de Brasília).`);
  else if(h.status==='SCHEDULED')paragraphs.push(`${h.home.name} e ${h.away.name} têm confronto marcado por ${h.competition} em ${date} (horário de Brasília).`);
  // A stale/live state never becomes a promise of live coverage.
  else paragraphs.push(`${h.home.name} x ${h.away.name}, por ${h.competition}: consulte o estado e os dados registrados da partida abaixo.`);
  if(h.venue)paragraphs.push(`Local registrado: ${h.venue}${h.venueCity?`, ${h.venueCity}`:''}.`);
  const facts=['fixture',...(h.venue?['venue']:[])];
  if(match.form.state==='AVAILABLE'){
    for(const [team,rows] of [[h.home,match.form.data.home],[h.away,match.form.data.away]] as const){
      const valid=rows.filter(r=>r.status==='FINISHED'&&r.homeScore!==null&&r.awayScore!==null&&new Date(r.kickoff)<new Date(h.kickoff));
      if(valid.length>=3){const wins=valid.filter(r=>r.perspective==='W').length;
        paragraphs.push(`${team.name}: ${wins} ${wins===1?'vitória':'vitórias'} nos ${valid.length} resultados anteriores disponíveis nesta base.`);facts.push(`form-${team.publicId}`);}
    }
  }
  const meetings=match.form.state==='AVAILABLE'?match.form.data.headToHead.filter(r=>r.status==='FINISHED'&&r.homeScore!==null&&r.awayScore!==null&&new Date(r.kickoff)<new Date(h.kickoff)):[];
  if(meetings.length){paragraphs.push(`O retrospecto abaixo reúne ${meetings.length} ${meetings.length===1?'confronto anterior disponível':'confrontos anteriores disponíveis'} entre as equipes. Não representa necessariamente todo o histórico.`);facts.push('h2h');}
  if(match.standings.state==='AVAILABLE'&&match.standings.data.some(r=>r.highlighted)){facts.push('standings');}
  if(match.statistics.state==='AVAILABLE'&&match.statistics.data.length)facts.push('statistics');
  const label=finished?'resultado e dados do jogo':meetings.length?'retrospecto e dados do jogo':'horário e dados do jogo';
  return {title:`${h.home.name} x ${h.away.name}: ${label}`,description:paragraphs[0],paragraphs,facts,
    h2hLinks:meetings.slice(0,2).map(r=>({href:matchPath('br',r.publicId,r.home,r.away),label:`${r.home} ${r.homeScore} x ${r.awayScore} ${r.away}`}))};
}

function spanishFactualContent(match:Pick<MatchCenterView,'header'|'form'|'standings'|'statistics'>,locale:InterfaceLocale){
  const h=match.header,profile=geoProfile(geoForLocale(locale));
  const date=new Intl.DateTimeFormat(profile.languageTag,{timeZone:profile.timeZone,dateStyle:'long',timeStyle:'short'}).format(new Date(h.kickoff));
  const finished=h.status==='FINISHED'&&h.homeScore!==null&&h.awayScore!==null;
  const competition=localizedCompetitionName(locale,h),zone=profile.timeZone.replaceAll('_',' ');
  const identity=finished?`${h.home.name} ${h.homeScore}–${h.awayScore} ${h.away.name}: resultado registrado en ${competition}, ${date} (${zone}).`
    :h.status==='SCHEDULED'?`${h.home.name} vs. ${h.away.name}, por ${competition}: ${date} (${zone}).`
    :`${h.home.name} vs. ${h.away.name}, por ${competition}: consulta el estado y los datos registrados del partido.`;
  const paragraphs=[identity],facts=['fixture'];
  if(h.venue){paragraphs.push(`Sede registrada: ${h.venue}${h.venueCity?`, ${h.venueCity}`:''}.`);facts.push('venue');}
  if(match.form.state==='AVAILABLE')for(const [team,rows] of [[h.home,match.form.data.home],[h.away,match.form.data.away]] as const){
    const valid=rows.filter(r=>r.status==='FINISHED'&&r.homeScore!==null&&r.awayScore!==null&&new Date(r.kickoff)<new Date(h.kickoff));
    if(valid.length>=3){const wins=valid.filter(r=>r.perspective==='W').length;
      paragraphs.push(`${team.name}: ${wins} ${wins===1?'victoria':'victorias'} en los ${valid.length} resultados anteriores disponibles en esta base.`);facts.push(`form-${team.publicId}`);}
  }
  const meetings=match.form.state==='AVAILABLE'?match.form.data.headToHead.filter(r=>r.status==='FINISHED'&&r.homeScore!==null&&r.awayScore!==null&&new Date(r.kickoff)<new Date(h.kickoff)):[];
  if(meetings.length){paragraphs.push(`El historial reúne ${meetings.length} ${meetings.length===1?'enfrentamiento anterior disponible':'enfrentamientos anteriores disponibles'}. No representa necesariamente el historial completo.`);facts.push('h2h');}
  if(match.standings.state==='AVAILABLE'&&match.standings.data.some(r=>r.highlighted))facts.push('standings');
  if(match.statistics.state==='AVAILABLE'&&match.statistics.data.length)facts.push('statistics');
  return {title:`${h.home.name} vs. ${h.away.name}: ${finished?'resultado y estadísticas':meetings.length?'historial y datos del partido':'horario y datos del partido'}`,
    description:identity,paragraphs,facts,h2hLinks:meetings.slice(0,2).map(r=>({href:matchPath(locale,r.publicId,r.home,r.away),label:`${r.home} ${r.homeScore}–${r.awayScore} ${r.away}`}))};
}
