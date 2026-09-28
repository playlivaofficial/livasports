import {VIDEO_CHANNELS} from './config';
import {platformDrafts} from './platform-content';
import {EDITORIAL_COPY,SOCIAL_POLICY_VERSION} from './socialCompliance';
import type {GrowthFixtureSnapshot,GrowthPlatformDraft,GrowthVideoScene,RankedGrowthFixture,SocialContentSource} from './types';

/** Input stays canonical and private; raw markets/operators are never spread into export metadata. */
export function socialSource(row:RankedGrowthFixture,fixture:GrowthFixtureSnapshot,generatedAt:string):SocialContentSource{
  return {fixture,teams:{home:fixture.home,away:fixture.away},competition:fixture.competition,locale:'pt-BR',stats:{standings:fixture.standings},
    form:row.storySignals?.form??null,h2h:null,markets:fixture.odds,operators:fixture.odds.bookmakers,targetGeo:'BR',generatedAt};
}
export function editorialPlatforms(row:RankedGrowthFixture,source:SocialContentSource,rank:number){
  // Reuse palettes, characters and scenery selection, not the generic betting narrative.
  const base=platformDrafts(row,{angle:source.stats.standings?'TABLE_PRESSURE':'WEEKEND_WATCHLIST',template:'MATCH_CLASH',reason:'Editorial match context'},[],[row],rank);
  const match=`${source.teams.home.name} vs ${source.teams.away.name}`;
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(source.fixture.kickoff));
  const table=source.stats.standings;
  const count=(n:number,singular:string,plural:string)=>`${n} ${n===1?singular:plural}`;
  const rows:string[]=[];
  for(const side of ['home','away'] as const){
    const f=source.form?.[side],name=source.teams[side].name;
    if(f&&Number.isInteger(f.played)&&f.played>0&&[f.wins,f.draws,f.losses,f.goalsFor,f.goalsAgainst].every(n=>Number.isInteger(n)&&n>=0)&&f.wins+f.draws+f.losses===f.played)
      rows.push(`${name}: ${count(f.wins,'vitória','vitórias')}, ${count(f.draws,'empate','empates')} e ${count(f.losses,'derrota','derrotas')} em ${count(f.played,'jogo registrado','jogos registrados')}.`);
  }
  const hasForm=rows.length>0;
  if(!rows.length&&table){
    if(table.homePosition!==null)rows.push(`${source.teams.home.name}: ${table.homePosition}º na classificação disponível.`);
    if(table.awayPosition!==null)rows.push(`${source.teams.away.name}: ${table.awayPosition}º na classificação disponível.`);
  }
  if(!rows.length)rows.push(source.competition.name,`${time} · horário de Brasília`);
  const hash=(s:string)=>'#'+s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
  return Object.fromEntries(VIDEO_CHANNELS.map(channel=>{
    const copy=EDITORIAL_COPY[channel];
    const assets=[source.teams.home,source.teams.away].map(t=>({kind:'TEAM_CREST' as const,label:t.name,url:t.imageUrl,commercialEligible:true}));
    const facts=rows.join(' • '),identity=`${source.competition.name} · ${time} · Brasília`;
    const hookSentence=/[.!?]$/.test(copy.hook)?copy.hook:`${copy.hook}.`;
    // A single TikTok-safe editorial narrative for every network. Only posting copy differs.
    const common=EDITORIAL_COPY.TIKTOK;
    const dataScenes=hasForm?rows.map(line=>['EDITORIAL_DATA','Forma recente',line,line] as const):[['EDITORIAL_DATA','Contexto da partida',facts,rows.join(' ')] as const];
    const specs=[['HOOK',common.hook,match,`${match}. ${common.hook}`],['CONTEXT','Análise do confronto',identity,`${identity}.`],
      ...dataScenes,['CTA','Mais dados no LivaSports',common.cta,common.cta]] as const;
    const scenes:GrowthVideoScene[]=specs.map(([visual,headline,subtitle,voiceover],i)=>({order:i+1,startSeconds:i*5,durationSeconds:5,template:'MATCH_CLASH',visual,
      assets:visual==='HOOK'||visual==='CONTEXT'?assets:[],headline,subtitle,voiceover,transition:i===0?'CUT':'FADE'}));
    const title=`${match}: ${copy.hook}`,caption=`${match} ⚽ ${hookSentence} ${rows.join(' ')} ${copy.cta}`;
    const result:GrowthPlatformDraft={channel,title,description:caption,hook:copy.hook,script:scenes.map(s=>s.voiceover).join(' '),caption,
      hashtags:['#futebol',hash(source.competition.name),hash(source.teams.home.name),hash(source.teams.away.name),'#livasports'],cta:copy.cta,template:'MATCH_CLASH',scenes,
      creative:base.INSTAGRAM_REELS.creative?{...base.INSTAGRAM_REELS.creative,hookFamily:common.hook,ctaFamily:common.cta,scenery:base.INSTAGRAM_REELS.creative.scenery.slice(0,4)}:undefined,
      social:{policyVersion:SOCIAL_POLICY_VERSION,mode:'EDITORIAL',coverText:`${match} — ${common.hook}`,altText:`${match}. ${source.competition.name}. Análise esportiva.`,sourceFixtureId:source.fixture.fixtureId,generatedAt:source.generatedAt,targetGeo:source.targetGeo,
        metadata:{title,description:caption,locale:source.locale}}};
    return [channel,result];
  })) as Record<typeof VIDEO_CHANNELS[number],GrowthPlatformDraft>;
}
