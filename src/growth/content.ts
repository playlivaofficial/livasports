import {createHash} from 'node:crypto';
import {CHANNEL_UTM,CONTENT_GENERATOR_VERSION,type GrowthChannel} from './config';
import {growthTrackingUrls} from './attribution';
import type {GrowthContentPack,GrowthFixtureSnapshot,RankedGrowthFixture} from './types';
import {platformDrafts} from './platform-content';
import {readiness,safeTemplate,selectedPlayers,selectStory,seoPriority,truthfulMatchContext} from './strategy';

const brazilTimeZone='America/Sao_Paulo';
const kickoffFormatter=new Intl.DateTimeFormat('pt-BR',{
  timeZone:brazilTimeZone,weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,
});

export function formatBrazilKickoff(kickoff:string):string{
  const parsed=new Date(kickoff);
  return Number.isFinite(parsed.getTime())?kickoffFormatter.format(parsed):'Horário a confirmar';
}
function tableContext(fixture:GrowthFixtureSnapshot):string|null{
  const table=fixture.standings;
  if(!table)return null;
  const parts:string[]=[];
  if(table.homePosition!==null)parts.push(`${fixture.home.name} está em ${table.homePosition}º`);
  if(table.awayPosition!==null)parts.push(`${fixture.away.name} está em ${table.awayPosition}º`);
  return parts.length?`${parts.join(' e ')} na tabela.`:null;
}

function oddsContext(fixture:GrowthFixtureSnapshot):string{
  if(!fixture.odds.count)return 'As odds ainda não estão disponíveis para comparação.';
  return fixture.odds.count===1
    ?`Há odds atuais de 1 casa para comparar no LivaSports.`
    :`Há odds atuais de ${fixture.odds.count} casas para comparar no LivaSports.`;
}

export function fixtureSnapshot(row:RankedGrowthFixture):GrowthFixtureSnapshot{
  const {signals,priority,odds}=row;
  return {fixtureId:signals.fixtureId,publicId:signals.publicId,
    home:{name:signals.home.name,publicId:signals.home.publicId,imageUrl:signals.home.imageUrl},
    away:{name:signals.away.name,publicId:signals.away.publicId,imageUrl:signals.away.imageUrl},
    competition:{name:signals.competitionName,slug:signals.competitionSlug},kickoff:signals.kickoff,
    rivalry:priority.rivalry,stage:priority.stage,standings:signals.standings,odds};
}

/** Deterministic PT-BR copy from persisted facts only. No prediction, injury, lineup or broadcast claims. */
export function generateContentPack(row:RankedGrowthFixture):GrowthContentPack{
  const fixture=fixtureSnapshot(row),kickoff=formatBrazilKickoff(fixture.kickoff);
  const context=tableContext(fixture),odds=oddsContext(fixture);
  const matchup=`${fixture.home.name} x ${fixture.away.name}`;
  const hook=fixture.rivalry?`${fixture.rivalry}: ${matchup}`
    :fixture.stage?`${fixture.stage} de ${fixture.competition.name}: ${matchup}`
      :`${matchup} pela ${fixture.competition.name}`;
  const cta=fixture.odds.count?'Compare as odds no LivaSports.':'Acompanhe os dados da partida no LivaSports.';
  const script=[hook+'.',`A bola rola ${kickoff}, no horário de Brasília.`,context,odds,cta].filter(Boolean).join(' ');
  const screens=[
    {order:1,durationSeconds:4,headline:fixture.competition.name,body:hook},
    {order:2,durationSeconds:5,headline:matchup,body:kickoff},
    ...(context?[{order:3,durationSeconds:5,headline:'Contexto da partida',body:context}]:[]),
    {order:context?4:3,durationSeconds:5,headline:'Odds e dados',body:odds},
    {order:context?5:4,durationSeconds:4,headline:'LivaSports',body:cta},
  ];
  const base=`${hook}\n\n${kickoff} (horário de Brasília). ${context??''}`.trim();
  const caption=(channel:GrowthChannel)=>`${base}\n\n${odds} ${cta}\n\n#${CHANNEL_UTM[channel].label.replace(/\s+/g,'')} #Futebol #LivaSports`;
  return {locale:'pt-BR',headline:matchup,hook,script,screens,cta,
    captions:{TIKTOK:caption('TIKTOK'),INSTAGRAM_REELS:caption('INSTAGRAM_REELS'),YOUTUBE_SHORTS:caption('YOUTUBE_SHORTS'),EDITORIAL:caption('EDITORIAL')},
    facts:[{label:'Competição',value:fixture.competition.name},{label:'Início',value:kickoff},
      ...(context?[{label:'Tabela',value:context}]:[]),{label:'Odds',value:fixture.odds.label}],
    generatedBy:'DETERMINISTIC_TEMPLATE',generatorVersion:CONTENT_GENERATOR_VERSION};
}

/** V1.1 keeps the V1 facts contract while adding one shared SEO/story/platform plan. */
export function generateV11ContentPack(row:RankedGrowthFixture,rank=1,topSocial:RankedGrowthFixture[]=[row]):GrowthContentPack{
  const fixture=fixtureSnapshot(row),players=selectedPlayers(row),initialStory=selectStory(row,players,{rank,topSocial});
  const quality=readiness(row,initialStory,players),story={...initialStory,template:safeTemplate(initialStory.template,quality)};
  const platforms=platformDrafts(row,story,players,topSocial),editorialContext=truthfulMatchContext(row);
  const primary=platforms.YOUTUBE_SHORTS;
  const captions:Record<GrowthChannel,string>={TIKTOK:platforms.TIKTOK.caption,INSTAGRAM_REELS:platforms.INSTAGRAM_REELS.caption,
    YOUTUBE_SHORTS:platforms.YOUTUBE_SHORTS.caption,EDITORIAL:`${fixture.home.name} x ${fixture.away.name}. ${editorialContext} Acesse ${row.destinationUrl}`};
  return {locale:'pt-BR',headline:`${fixture.home.name} x ${fixture.away.name}`,hook:primary.hook,script:primary.script,
    screens:primary.scenes.map(scene=>({order:scene.order,durationSeconds:scene.durationSeconds,headline:scene.headline,body:scene.subtitle})),
    cta:primary.cta,captions,facts:[{label:'Competição',value:fixture.competition.name},{label:'Início',value:formatBrazilKickoff(fixture.kickoff)},
      {label:'História',value:story.reason},{label:'Contexto',value:editorialContext||'Dados da partida disponíveis no LivaSports.'}],
    generatedBy:'DETERMINISTIC_TEMPLATE',generatorVersion:CONTENT_GENERATOR_VERSION,version:'V1.1',seo:seoPriority(row,rank),story,players,platforms,readiness:quality};
}

export function contentSourceHash(row:RankedGrowthFixture):string{
  const value={generatorVersion:CONTENT_GENERATOR_VERSION,fixture:fixtureSnapshot(row),score:row.priority.total,breakdown:row.priority.lines,storySignals:row.storySignals??null};
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function generatedContent(row:RankedGrowthFixture,rank=1,topSocial:RankedGrowthFixture[]=[row]){
  return {content:generateV11ContentPack(row,rank,topSocial),fixture:fixtureSnapshot(row),sourceHash:contentSourceHash(row),
    tracking:growthTrackingUrls(row.destinationUrl,row.signals.publicId)};
}
