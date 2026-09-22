import {QUALITY,SHORTLIST} from './config';
import type {GrowthCreativeTemplate,GrowthFixture,GrowthIntentCluster,GrowthReadiness,GrowthSelectedPlayer,GrowthSeoPriority,GrowthStorySelection,GrowthTeamForm,RankedGrowthFixture} from './types';

const score=(value:number|null,multiplier:number)=>value===null?0:value*multiplier;
export function playerEvidenceScore(stats:GrowthSelectedPlayer['statistics']){
  return Math.round((score(stats.goals,8)+score(stats.assists,5)+score(stats.starts,2)+score(stats.appearances,1)+score(stats.minutes,1/90))*10)/10;
}

export function selectedPlayers(row:GrowthFixture):GrowthSelectedPlayer[]{
  const choose=(candidates:NonNullable<GrowthFixture['storySignals']>['players']['home'])=>candidates
    .filter(candidate=>candidate.evidenceScore>=QUALITY.playerEvidenceMinimum)
    .sort((a,b)=>b.evidenceScore-a.evidenceScore||a.name.localeCompare(b.name))[0];
  const home=row.storySignals?choose(row.storySignals.players.home):undefined;
  const away=row.storySignals?choose(row.storySignals.players.away):undefined;
  return [home,away].filter((candidate):candidate is NonNullable<typeof candidate>=>!!candidate).map(candidate=>({
    id:candidate.id,publicId:candidate.publicId,teamId:candidate.teamId,teamName:candidate.teamName,name:candidate.name,
    selectionReason:candidate.selectionReason,evidenceScore:candidate.evidenceScore,statistics:candidate.statistics,media:candidate.media,
  }));
}

const sameBrazilDay=(a:string,b:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a))===
  new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b));

export function selectStory(row:RankedGrowthFixture,players:GrowthSelectedPlayer[],options:{rank:number;topSocial?:RankedGrowthFixture[]}):GrowthStorySelection{
  const topToday=options.rank===1&&(options.topSocial?.filter(item=>sameBrazilDay(item.signals.kickoff,row.signals.kickoff)).length??0)>=3;
  if(topToday)return {angle:'TOP_MATCHES_TODAY',template:'TOP_MATCHES_TODAY',reason:'pelo menos três partidas do Top 5 caem no mesmo dia no Brasil'};
  if(row.priority.rivalry)return {angle:'DERBY_RIVALRY',template:'MATCH_CLASH',reason:`rivalidade verificada na configuração: ${row.priority.rivalry}`};
  if(players.length===2)return {angle:'PLAYER_VS_PLAYER',template:'PLAYER_CLASH',reason:`os dois times têm evidência de jogador na temporada acima de ${QUALITY.playerEvidenceMinimum}`};
  if(players.length===1)return {angle:'STAR_FOCUS',template:'STAR_FOCUS',reason:`${players[0].name} tem a evidência individual mais forte e defensável da temporada`};
  const standings=row.priority.lines.find(line=>line.component==='standings');
  if(standings&&standings.strength>0)return {angle:'TABLE_PRESSURE',template:'MATCH_CLASH',reason:'a posição real dos times na tabela dá peso ao confronto'};
  if((row.odds.publicBookmakers?.length??0)>=2&&(row.odds.publicPriceGap??0)>=QUALITY.oddsGapMinimum)
    return {angle:'ODDS_GAP',template:'ODDS_COMPARISON',reason:`a diferença real entre preços públicos é ${row.odds.publicPriceGap?.toFixed(2)}`};
  if(row.priority.stage||row.priority.lines.find(line=>line.component==='clubs')!.strength>=0.72)
    return {angle:'BIG_MATCH',template:'MATCH_CLASH',reason:row.priority.stage?`${row.priority.stage} aumenta o peso do confronto`:'a prioridade dos clubes transforma o confronto na história principal'};
  return {angle:'WEEKEND_WATCHLIST',template:'MATCH_CLASH',reason:'a partida se destaca no placar compartilhado sem um ângulo verificado mais forte'};
}

export function searchIntent(row:RankedGrowthFixture):GrowthIntentCluster{
  const match=`${row.signals.home.name} x ${row.signals.away.name}`;
  return {primary:match,canonicalUrl:row.destinationUrl,queries:[match,`${match} odds`,`${match} estatísticas`,`${match} escalações`,
    `${row.signals.competitionName} jogos hoje`,`${row.signals.home.name} próximos jogos`,`${row.signals.away.name} próximos jogos`,`${row.signals.competitionName} classificação`]};
}

function formLine(name:string,form:GrowthTeamForm|null){
  if(!form||form.played<3)return null;
  if(form.wins>=3)return `${name} venceu ${form.wins} dos últimos ${form.played} jogos registrados.`;
  if(form.losses>=3)return `${name} perdeu ${form.losses} dos últimos ${form.played} jogos registrados.`;
  return null;
}

export function truthfulMatchContext(row:RankedGrowthFixture):string{
  const lines:string[]=[];
  if(row.priority.rivalry)lines.push(`${row.priority.rivalry}: rivalidade reconhecida na configuração editorial do LivaSports.`);
  if(row.priority.stage)lines.push(`${row.priority.stage} aumenta o peso deste confronto.`);
  const table=row.signals.standings;
  if(table&&table.homePosition!==null&&table.awayPosition!==null){
    const home=table.homePosition,away=table.awayPosition;
    if(home<=4&&away<=4)lines.push(`Confronto direto no topo: ${row.signals.home.name} é ${home}º e ${row.signals.away.name}, ${away}º.`);
    else if(home<=4||away<=4){const leader=home<=4?row.signals.home.name:row.signals.away.name,leaderPosition=home<=4?home:away,other=home<=4?row.signals.away.name:row.signals.home.name,otherPosition=home<=4?away:home;
      lines.push(`A rodada pesa na parte de cima: ${leader} começa em ${leaderPosition}º; ${other}, em ${otherPosition}º.`);}
    else if(table.totalTeams!==null&&(home>table.totalTeams-4||away>table.totalTeams-4))lines.push(`A tabela aumenta a pressão: ${row.signals.home.name} ocupa o ${home}º lugar e ${row.signals.away.name}, o ${away}º.`);
    else lines.push(`Antes da rodada, ${row.signals.home.name} é ${home}º e ${row.signals.away.name}, ${away}º.`);
  }
  const form=row.storySignals?.form;
  const home=formLine(row.signals.home.name,form?.home??null),away=formLine(row.signals.away.name,form?.away??null);
  if(home)lines.push(home);if(away)lines.push(away);
  if(row.signals.oddsBookmakers>0)lines.push('A página reúne comparação de odds e acesso ao Meu Bilhete.');
  return lines.slice(0,3).join(' ');
}

export function seoPriority(row:RankedGrowthFixture,rank:number):GrowthSeoPriority{
  const level=rank<=SHORTLIST.socialSize?'TOP_5':rank<=SHORTLIST.contentSize?'TOP_10':'STANDARD';
  const placements=level==='TOP_5'?['HOME','DAILY','COMPETITION','HOME_TEAM','AWAY_TEAM']:level==='TOP_10'?['DAILY','COMPETITION','HOME_TEAM','AWAY_TEAM']:[];
  return {level,rank,score:row.priority.total,intent:searchIntent(row),placements,context:truthfulMatchContext(row)};
}

export function readiness(row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[]):GrowthReadiness{
  const components={story:story.angle==='WEEKEND_WATCHLIST'?8:story.angle==='BIG_MATCH'?12:16,
    data:Math.round((row.priority.lines.find(line=>line.component==='data')?.strength??0)*20),
    player:players.length?Math.min(18,players.reduce((sum,p)=>sum+(p.evidenceScore>=QUALITY.playerEvidenceMinimum?9:0),0)):8,
    rights:players.length?players.reduce((sum,p)=>sum+(p.media.commercialEligible?7:3),0):12,
    odds:Math.min(15,row.signals.oddsBookmakers*5),template:story.template?12:0,duplicate:8};
  const raw=Math.min(100,Object.values(components).reduce((sum,value)=>sum+value,0));
  const reasons=Object.entries(components).map(([key,value])=>`${key} ${value}`);
  if(raw>=QUALITY.publishReady)return {score:raw,state:'READY',reasons,fallbackApplied:false};
  if(raw>=QUALITY.needsReview)return {score:raw,state:'NEEDS_REVIEW',reasons,fallbackApplied:false};
  return {score:raw,state:'FALLBACK',reasons:[...reasons,'below readiness floor; club-based Match Clash required'],fallbackApplied:true};
}

export function safeTemplate(template:GrowthCreativeTemplate,quality:GrowthReadiness):GrowthCreativeTemplate{return quality.state==='FALLBACK'?'MATCH_CLASH':template;}
