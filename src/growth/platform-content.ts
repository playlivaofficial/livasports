import {PLATFORM_PROFILES,type GrowthVideoChannel} from './config';
import {publicBookmakerCopy} from './public-bookmakers';
import {truthfulMatchContext} from './strategy';
import type {GrowthPlatformDraft,GrowthSelectedPlayer,GrowthStoryAngle,GrowthStorySelection,GrowthVideoScene,RankedGrowthFixture} from './types';

const kickoffFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const kickoff=(value:string)=>kickoffFormatter.format(new Date(value)).replace(',',' ·');
const matchup=(row:RankedGrowthFixture)=>`${row.signals.home.name} x ${row.signals.away.name}`;
const hash=(value:string)=>'#'+value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'');
const variantIndex=(seed:string,length:number)=>{let value=2166136261;for(let index=0;index<seed.length;index++)value=Math.imul(value^seed.charCodeAt(index),16777619);return (value>>>0)%length;};
const variant=<T>(row:RankedGrowthFixture,channel:GrowthVideoChannel,story:GrowthStorySelection,kind:string,values:T[])=>values[variantIndex(`${row.signals.fixtureId}:${channel}:${story.angle}:${kind}`,values.length)]!;

const HOOK_FAMILIES:Record<GrowthVideoChannel,Record<GrowthStoryAngle,string[]>>={
  TIKTOK:{
    BIG_MATCH:['Para tudo: tem jogaço chegando','Esse confronto merece seu radar','Olha o tamanho desse duelo'],
    PLAYER_VS_PLAYER:['Dois nomes frente a frente','Olha quem pode marcar este duelo'],
    STAR_FOCUS:['Fica de olho neste nome','Um jogador muda o foco deste jogo'],
    ODDS_GAP:['O mesmo jogo, preços diferentes','Olha como a mesma odd pode mudar'],
    TABLE_PRESSURE:['A tabela deixa esse duelo mais quente','Olha o peso deste jogo na tabela','Esse confronto chega com pressão de tabela','Tem posição importante em jogo'],
    DERBY_RIVALRY:['Dia de rivalidade','Esse clássico não precisa de convite'],
    TOP_MATCHES_TODAY:['Os jogos que pedem seu radar hoje','Abre a agenda: olha o Top 5'],
    WEEKEND_WATCHLIST:['Coloca esse jogo no radar','Tem confronto para acompanhar nesta rodada'],
  },
  INSTAGRAM_REELS:{
    BIG_MATCH:['O confronto que dá tom à rodada','Um grande duelo em foco'],
    PLAYER_VS_PLAYER:['Dois protagonistas. Um confronto.','Talento frente a frente'],
    STAR_FOCUS:['Um nome para acompanhar','O protagonista deste recorte'],
    ODDS_GAP:['Quando os preços contam outra história','Uma comparação que vale abrir'],
    TABLE_PRESSURE:['A tabela coloca peso neste duelo','Pontos que mexem com a rodada','A parte de cima passa por aqui','Pressão de tabela em foco'],
    DERBY_RIVALRY:['Rivalidade em primeiro plano','Um clássico em foco'],
    TOP_MATCHES_TODAY:['A agenda essencial de hoje','Cinco jogos para salvar'],
    WEEKEND_WATCHLIST:['Um jogo para guardar no radar','Na lista desta rodada'],
  },
  YOUTUBE_SHORTS:{
    BIG_MATCH:['{match}: guia rápido do confronto','{match}: por que este duelo chama atenção'],
    PLAYER_VS_PLAYER:['{match}: os nomes do confronto','{match}: dois jogadores para acompanhar'],
    STAR_FOCUS:['{match}: o jogador em foco','{match}: um nome para acompanhar'],
    ODDS_GAP:['{match}: onde os preços mudam','{match}: como comparar o mesmo mercado'],
    TABLE_PRESSURE:['{match}: o peso deste jogo na tabela','{match}: posições e contexto em poucos segundos','{match}: o dado-chave antes da rodada'],
    DERBY_RIVALRY:['{match}: guia rápido da rivalidade','{match}: o contexto deste clássico'],
    TOP_MATCHES_TODAY:['Top 5 de hoje: jogos e contexto','Jogos de hoje: o que entra no radar'],
    WEEKEND_WATCHLIST:['{match}: por que está no radar','{match}: guia rápido da rodada'],
  },
};

const CTA_VARIANTS:Record<GrowthVideoChannel,Array<{headline:string;copy:string}>>={
  TIKTOK:[
    {headline:'Abre e monta seu bilhete',copy:'Abre no LivaSports, compara as odds e monta seu bilhete.'},
    {headline:'Compara antes de clicar',copy:'Confere os dados e compara os preços no LivaSports.'},
    {headline:'Leva esse jogo com você',copy:'Vai ao LivaSports, abre o confronto e monta seu bilhete.'},
    {headline:'Dados primeiro. Decisão depois.',copy:'Vê o contexto no LivaSports antes de escolher sua casa.'},
    {headline:'Agora olha os preços',copy:'Compara as odds no LivaSports e decide com os dados na tela.'},
  ],
  INSTAGRAM_REELS:[
    {headline:'Salve. Compare. Decida.',copy:'Salve o jogo e veja a comparação completa no LivaSports.'},
    {headline:'Seu guia para a rodada',copy:'Guarde este confronto e compare as odds no LivaSports.'},
    {headline:'Contexto antes do clique',copy:'Veja os dados completos e monte seu bilhete no LivaSports.'},
    {headline:'Guarde este confronto',copy:'Salve para a rodada; o contexto completo está no LivaSports.'},
    {headline:'Da tabela ao Meu Bilhete',copy:'Abra o confronto, compare os preços e decida no LivaSports.'},
  ],
  YOUTUBE_SHORTS:[
    {headline:'Dados, odds e Meu Bilhete',copy:'Veja dados, odds e Meu Bilhete no LivaSports.'},
    {headline:'Compare o mesmo mercado',copy:'Abra a comparação completa de odds no LivaSports.'},
    {headline:'Continue no confronto',copy:'Veja horário, contexto e preços na página do jogo.'},
    {headline:'Seu próximo passo',copy:'Confira os dados do confronto antes de montar seu bilhete.'},
    {headline:'Tudo na página do jogo',copy:'Acesse estatísticas, odds e Meu Bilhete no LivaSports.'},
  ],
};

function hookHeadline(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection){
  return variant(row,channel,story,'hook',HOOK_FAMILIES[channel][story.angle]).replace('{match}',matchup(row));
}
function selectedCta(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection){
  const preferred:Partial<Record<GrowthStoryAngle,number[]>>={ODDS_GAP:[1,4],PLAYER_VS_PLAYER:[2,4],STAR_FOCUS:[2,4],TOP_MATCHES_TODAY:[1,3],WEEKEND_WATCHLIST:[1,3],TABLE_PRESSURE:[0,3,4]};
  const indexes=preferred[story.angle]??CTA_VARIANTS[channel].map((_,index)=>index),index=variant(row,channel,story,'cta',indexes);
  return CTA_VARIANTS[channel][index]!;
}

function tablePressureLead(row:RankedGrowthFixture){
  const table=row.signals.standings;if(!table||table.homePosition===null||table.awayPosition===null)return 'A tabela dá peso real a este confronto.';
  const home=table.homePosition,away=table.awayPosition;
  if(home<=4&&away<=4)return 'Duelo direto no G4. Cada ponto pesa na parte de cima.';
  if(home<=4)return `${row.signals.home.name} chega no G4 — e esse jogo vale posição na parte de cima.`;
  if(away<=4)return `${row.signals.away.name} chega no G4 — e esse jogo vale posição na parte de cima.`;
  if(table.totalTeams!==null&&home>table.totalTeams-4)return `${row.signals.home.name} começa na parte de baixo e entra em campo sob pressão.`;
  if(table.totalTeams!==null&&away>table.totalTeams-4)return `${row.signals.away.name} começa na parte de baixo e entra em campo sob pressão.`;
  const gap=Math.abs(home-away);return gap<=3?`Só ${gap} ${gap===1?'posição separa':'posições separam'} os times antes da rodada.`:'A tabela dá peso real a este confronto.';
}

function storyLead(row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[]){
  const match=matchup(row);
  switch(story.angle){
    case 'DERBY_RIVALRY':return `${row.priority.rivalry}: rivalidade e contexto real em campo.`;
    case 'PLAYER_VS_PLAYER':return `${players[0].name} de um lado. ${players[1].name} do outro.`;
    case 'STAR_FOCUS':return `${players[0].name} é o nome para acompanhar neste ${match}.`;
    case 'TABLE_PRESSURE':return tablePressureLead(row);
    case 'ODDS_GAP':return 'O mesmo mercado aparece com preços diferentes.';
    case 'TOP_MATCHES_TODAY':return 'Os jogos que lideram a agenda brasileira de hoje.';
    case 'WEEKEND_WATCHLIST':return 'Jogo para colocar no radar desta rodada.';
    case 'BIG_MATCH':return `Jogaço: ${match}.`;
    default:return `${match} entrou na nossa lista para acompanhar.`;
  }
}

function sceneAssets(row:RankedGrowthFixture,players:GrowthSelectedPlayer[]){
  const playerAssets=players.map(player=>({kind:player.media.commercialEligible&&player.media.assetUrl?'PLAYER_IMAGE' as const:'PLAYER_SILHOUETTE' as const,
    label:player.name,url:player.media.commercialEligible?player.media.assetUrl:null,commercialEligible:player.media.commercialEligible}));
  return playerAssets.length?playerAssets:[
    {kind:'TEAM_CREST' as const,label:row.signals.home.name,url:row.signals.home.imageUrl,commercialEligible:true},
    {kind:'TEAM_CREST' as const,label:row.signals.away.name,url:row.signals.away.imageUrl,commercialEligible:true},
  ];
}

const clubAssets=(row:RankedGrowthFixture)=>[
  {kind:'TEAM_CREST' as const,label:row.signals.home.name,url:row.signals.home.imageUrl,commercialEligible:true},
  {kind:'TEAM_CREST' as const,label:row.signals.away.name,url:row.signals.away.imageUrl,commercialEligible:true},
];
const firstFact=(value:string,fallback:string)=>value.split(/(?<=\.)\s+/)[0]||fallback;

function plan(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],hook:string,cta:{headline:string;copy:string},topSocial:RankedGrowthFixture[]):GrowthVideoScene[]{
  const profile=PLATFORM_PROFILES[channel],template=story.template,match=matchup(row),context=truthfulMatchContext(row)||`${row.signals.competitionName} · ${kickoff(row.signals.kickoff)}`;
  const keyFact=firstFact(context,`${row.signals.competitionName} · ${kickoff(row.signals.kickoff)}`);
  const odds=publicBookmakerCopy({bookmakers:row.odds.publicBookmakers??[],priceGap:row.odds.publicPriceGap??null});
  const watchlist=topSocial.slice(0,5).map((item,index)=>`${index+1}. ${item.signals.home.name} x ${item.signals.away.name}`).join('  •  ');
  const transitions=channel==='TIKTOK'?['CUT','SLIDE','CUT','SLIDE','CUT'] as const:channel==='INSTAGRAM_REELS'?['FADE','FADE','SLIDE','FADE','FADE'] as const:['CUT','SLIDE','CUT','FADE','CUT'] as const;
  const platformHeadlines=channel==='TIKTOK'?[hook,match,'O detalhe que pesa','Compare antes de clicar',cta.headline]
    :channel==='INSTAGRAM_REELS'?[hook,match,'O que está em jogo','Uma comparação mais clara',cta.headline]
      :[hook,'Ficha rápida','O dado-chave da partida','Onde comparar as odds',cta.headline];
  const specs=template==='TOP_MATCHES_TODAY'?[
    ['HOOK',platformHeadlines[0],'Os confrontos que puxam a agenda no Brasil.',transitions[0]],
    ['WATCHLIST',platformHeadlines[1],watchlist,transitions[1]],
    ['CONTEXT',platformHeadlines[2],keyFact,transitions[2]],
    ['ODDS',platformHeadlines[3],odds,transitions[3]],
    ['CTA',platformHeadlines[4],cta.copy,transitions[4]],
  ] as const:[
    ['HOOK',platformHeadlines[0],storyLead(row,story,players),transitions[0]],
    ['MATCHUP',platformHeadlines[1],`${row.signals.competitionName} · ${kickoff(row.signals.kickoff)}`,transitions[1]],
    [players.length?'PLAYER':'CONTEXT',platformHeadlines[2],players.map(p=>p.selectionReason).join(' · ')||keyFact,transitions[2]],
    ['ODDS',platformHeadlines[3],odds,transitions[3]],
    ['CTA',platformHeadlines[4],cta.copy,transitions[4]],
  ] as const;
  const weights=channel==='TIKTOK'?[2,4,5,5,4]:channel==='INSTAGRAM_REELS'?[3,5,6,6,4]:[2,5,7,6,5];
  let start=0;
  return specs.map((spec,index)=>{const duration=weights[index]??Math.max(3,Math.floor(profile.durationSeconds/specs.length));const scene:GrowthVideoScene={order:index+1,startSeconds:start,durationSeconds:duration,
    template,visual:spec[0],assets:index===0||index===1?clubAssets(row):index===2?sceneAssets(row,players):[],headline:spec[1],subtitle:spec[2],voiceover:spec[2],transition:spec[3]};start+=duration;return scene;});
}

function platformText(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],topSocial:RankedGrowthFixture[]):GrowthPlatformDraft{
  const match=matchup(row),time=kickoff(row.signals.kickoff),lead=storyLead(row,story,players),context=truthfulMatchContext(row);
  const opening=hookHeadline(channel,row,story),cta=selectedCta(channel,row,story);
  const names=row.odds.publicBookmakers??[];const odds=story.angle==='ODDS_GAP'&&names.length>=2
    ?`Preços reais visíveis de ${names.map(item=>item.name).join(' e ')} apresentam diferença no mesmo mercado.`
    :publicBookmakerCopy({bookmakers:names,priceGap:row.odds.publicPriceGap??null});
  const content=channel==='TIKTOK'?{
    title:`${match}: ${opening}`,hook:`${opening}: ${match}.`,description:`${row.signals.competitionName} · ${time}. ${lead}`,
    script:[`${opening}: ${match}.`,lead,context,odds,cta.copy].filter(Boolean).join(' '),caption:`${match}. ${lead} ${cta.copy}`,
  }:channel==='INSTAGRAM_REELS'?{
    title:`${opening} · ${match}`,hook:`${opening}: ${match}.`,description:`Um guia visual de ${match}, com contexto verificado e comparação no LivaSports.`,
    script:[`${opening}: ${match}.`,lead,context,odds,cta.copy].filter(Boolean).join(' '),caption:`Salve para acompanhar: ${match}, ${time}. ${context} ${cta.copy}`,
  }:{
    title:`${match}: horário, contexto e odds | ${row.signals.competitionName}`,hook:`${opening}.`,description:`Horário, contexto de tabela e comparação de odds para ${match}, pela ${row.signals.competitionName}.`,
    script:[`${opening}.`,`${row.signals.competitionName}, ${time}.`,lead,context,odds,cta.copy].filter(Boolean).join(' '),caption:`${match}: horário e contexto verificado. ${cta.copy}`,
  };
  const hashtags=[hash(row.signals.home.name),hash(row.signals.away.name),hash(row.signals.competitionName),'#LivaSports'].slice(0,PLATFORM_PROFILES[channel].maxHashtags);
  return {channel,...content,hashtags,cta:cta.copy,template:story.template,scenes:plan(channel,row,story,players,opening,cta,topSocial)};
}

export function platformDrafts(row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],topSocial:RankedGrowthFixture[]):Record<GrowthVideoChannel,GrowthPlatformDraft>{
  return {TIKTOK:platformText('TIKTOK',row,story,players,topSocial),INSTAGRAM_REELS:platformText('INSTAGRAM_REELS',row,story,players,topSocial),YOUTUBE_SHORTS:platformText('YOUTUBE_SHORTS',row,story,players,topSocial)};
}

/** Optional future voice providers plug in here; V1.1 always renders complete mute-first videos without one. */
export interface GrowthVoiceoverProvider {kind:string;renderPtBr(text:string):Promise<Buffer>;}
