import {PLATFORM_PROFILES,type GrowthVideoChannel} from './config';
import {publicBookmakerCopy} from './public-bookmakers';
import {truthfulMatchContext} from './strategy';
import type {GrowthPlatformDraft,GrowthSelectedPlayer,GrowthStoryAngle,GrowthStorySelection,GrowthVideoScene,RankedGrowthFixture} from './types';

const kickoffFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const kickoff=(value:string)=>kickoffFormatter.format(new Date(value)).replace(',',' ·');
const matchup=(row:RankedGrowthFixture)=>`${row.signals.home.name} x ${row.signals.away.name}`;
const hash=(value:string)=>'#'+value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'');
const variantIndex=(seed:string,length:number)=>{let value=2166136261;for(let index=0;index<seed.length;index++)value=Math.imul(value^seed.charCodeAt(index),16777619);return (value>>>0)%length;};
/**
 * Deterministic variant choice, offset by the fixture's rank in the day's Top 5.
 *
 * Seeding on the fixture alone was not enough: a Top 5 where three fixtures share a story angle drew
 * three times from the same pool and collided, which is how the same sentence reached most of the
 * feed. The rank offset guarantees neighbouring ranks land on different entries, and the pools below
 * are sized so a five-fixture batch cannot exhaust them.
 */
const variant=<T>(row:RankedGrowthFixture,channel:GrowthVideoChannel,story:GrowthStorySelection,kind:string,values:T[],rank=1)=>
  values[(variantIndex(`${row.signals.fixtureId}:${channel}:${story.angle}:${kind}`,values.length)+rank)%values.length]!;

const HOOK_FAMILIES:Record<GrowthVideoChannel,Record<GrowthStoryAngle,string[]>>={
  // Every pool holds at least six lines: a Top 5 where several fixtures share a story angle must never
  // exhaust one, which is exactly how the feed ended up recycling the same two sentences.
  TIKTOK:{
    BIG_MATCH:['Para tudo: tem jogaço chegando','Esse confronto merece seu radar','Olha o tamanho desse duelo',
      'Esse aqui é dos grandes','Se liga no jogo da rodada','Anota esse confronto aí'],
    PLAYER_VS_PLAYER:['Dois nomes frente a frente','Olha quem pode marcar este duelo','Duelo particular dentro do jogo',
      'Os dois nomes que puxam esse confronto','Cada lado tem o seu protagonista','Esse duelo tem dono dos dois lados'],
    STAR_FOCUS:['Fica de olho neste nome','Um jogador muda o foco deste jogo','Esse cara decide jogo',
      'Tem um nome que carrega esse time','O jogador que você vai procurar em campo','Esse é o nome pra acompanhar'],
    ODDS_GAP:['O mesmo jogo, preços diferentes','Olha como a mesma odd pode mudar','Mesma aposta, valor diferente',
      'Compara antes de apostar nesse','A diferença de preço aqui é real','Mesmo mercado, casas discordando'],
    TABLE_PRESSURE:['A tabela deixa esse duelo mais quente','Olha o peso deste jogo na tabela','Esse confronto chega com pressão de tabela',
      'Tem posição importante em jogo','A classificação muda depois desse','Jogo de seis pontos na prática'],
    DERBY_RIVALRY:['Dia de rivalidade','Esse clássico não precisa de convite','Clássico é outro campeonato',
      'Tabela não manda em clássico','Esse aqui é pessoal','Rivalidade que não depende de momento'],
    TOP_MATCHES_TODAY:['Os jogos que pedem seu radar hoje','Abre a agenda: olha o Top 5','Cinco jogos pra hoje',
      'A rodada de hoje resumida','Salva essa lista de hoje','O que assistir hoje, em ordem'],
    WEEKEND_WATCHLIST:['Coloca esse jogo no radar','Tem confronto para acompanhar nesta rodada','Esse passa batido, mas não devia',
      'Um jogo escondido na rodada','Guarda esse nome pra rodada','Nem todo jogão é o óbvio'],
  },
  INSTAGRAM_REELS:{
    BIG_MATCH:['O confronto que dá tom à rodada','Um grande duelo em foco','O jogo que organiza a rodada',
      'Peso de decisão nesta rodada','Um confronto de outro patamar','O duelo que merece atenção'],
    PLAYER_VS_PLAYER:['Dois protagonistas. Um confronto.','Talento frente a frente','Duas referências no mesmo jogo',
      'Cada lado com o seu nome','Um duelo dentro do duelo','Dois jogadores, uma decisão'],
    STAR_FOCUS:['Um nome para acompanhar','O protagonista deste recorte','O jogador que sustenta o time',
      'A referência deste confronto','Um nome acima da média','O foco deste jogo tem dono'],
    ODDS_GAP:['Quando os preços contam outra história','Uma comparação que vale abrir','O mesmo mercado, leituras diferentes',
      'Preço não é detalhe','Onde as casas discordam','Comparar muda o resultado final'],
    TABLE_PRESSURE:['A tabela coloca peso neste duelo','Pontos que mexem com a rodada','A parte de cima passa por aqui',
      'Pressão de tabela em foco','Classificação em jogo','O contexto está na tabela'],
    DERBY_RIVALRY:['Rivalidade em primeiro plano','Um clássico em foco','Clássico tem regra própria',
      'História e rivalidade no mesmo jogo','O peso de um clássico','Rivalidade acima do momento'],
    TOP_MATCHES_TODAY:['A agenda essencial de hoje','Cinco jogos para salvar','O recorte da rodada',
      'A seleção de hoje','Sua rodada, organizada','Cinco confrontos em destaque'],
    WEEKEND_WATCHLIST:['Um jogo para guardar no radar','Na lista desta rodada','Discreto na tabela, interessante em campo',
      'Vale um lugar na sua rodada','Um confronto subestimado','Fora do óbvio desta rodada'],
  },
  YOUTUBE_SHORTS:{
    BIG_MATCH:['{match}: guia rápido do confronto','{match}: por que este duelo chama atenção','{match}: o que está em jogo',
      '{match}: contexto em 30 segundos','{match}: o peso real do confronto','{match}: tudo o que importa antes da bola rolar'],
    PLAYER_VS_PLAYER:['{match}: os nomes do confronto','{match}: dois jogadores para acompanhar','{match}: o duelo individual',
      '{match}: quem puxa cada lado','{match}: os protagonistas','{match}: nomes e números'],
    STAR_FOCUS:['{match}: o jogador em foco','{match}: um nome para acompanhar','{match}: a referência do time',
      '{match}: quem carrega o ataque','{match}: o nome decisivo','{match}: o jogador a observar'],
    ODDS_GAP:['{match}: onde os preços mudam','{match}: como comparar o mesmo mercado','{match}: a diferença entre as casas',
      '{match}: leitura de odds','{match}: preços lado a lado','{match}: comparação antes da escolha'],
    TABLE_PRESSURE:['{match}: o peso deste jogo na tabela','{match}: posições e contexto em poucos segundos','{match}: o dado-chave antes da rodada',
      '{match}: o que a classificação diz','{match}: contexto de tabela','{match}: quem tem mais a perder'],
    DERBY_RIVALRY:['{match}: guia rápido da rivalidade','{match}: o contexto deste clássico','{match}: por que este clássico importa',
      '{match}: história e momento','{match}: o clássico explicado','{match}: rivalidade em números'],
    TOP_MATCHES_TODAY:['Top 5 de hoje: jogos e contexto','Jogos de hoje: o que entra no radar','A agenda de hoje em ordem',
      'Cinco jogos, um resumo','O radar de hoje','Hoje tem: os cinco principais'],
    WEEKEND_WATCHLIST:['{match}: por que está no radar','{match}: guia rápido da rodada','{match}: o que observar',
      '{match}: contexto da rodada','{match}: vale acompanhar?','{match}: o resumo do confronto'],
  },
};

const CTA_VARIANTS:Record<GrowthVideoChannel,Array<{headline:string;copy:string}>>={
  TIKTOK:[
    {headline:'Abre e monta seu bilhete',copy:'Abre no LivaSports.com, compara as odds e monta seu bilhete.'},
    {headline:'Compara antes de clicar',copy:'Confere os dados e compara os preços no LivaSports.com.'},
    {headline:'Leva esse jogo com você',copy:'Vai ao LivaSports.com, abre o confronto e monta seu bilhete.'},
    {headline:'Dados primeiro. Decisão depois.',copy:'Vê o contexto no LivaSports.com antes de escolher sua casa.'},
    {headline:'Agora olha os preços',copy:'Compara as odds no LivaSports.com e decide com os dados na tela.'},
  ],
  INSTAGRAM_REELS:[
    {headline:'Salve. Compare. Decida.',copy:'Salve o jogo e veja a comparação completa no LivaSports.com.'},
    {headline:'Seu guia para a rodada',copy:'Guarde este confronto e compare as odds no LivaSports.com.'},
    {headline:'Contexto antes do clique',copy:'Veja os dados completos e monte seu bilhete no LivaSports.com.'},
    {headline:'Guarde este confronto',copy:'Salve para a rodada; o contexto completo está no LivaSports.com.'},
    {headline:'Da tabela ao Meu Bilhete',copy:'Abra o confronto, compare os preços e decida no LivaSports.com.'},
  ],
  YOUTUBE_SHORTS:[
    {headline:'Dados, odds e Meu Bilhete',copy:'Veja dados, odds e Meu Bilhete no LivaSports.com.'},
    {headline:'Compare o mesmo mercado',copy:'Abra a comparação completa de odds no LivaSports.com.'},
    {headline:'Continue no confronto',copy:'Veja horário, contexto e preços na página do jogo.'},
    {headline:'Seu próximo passo',copy:'Confira os dados do confronto antes de montar seu bilhete.'},
    {headline:'Tudo na página do jogo',copy:'Acesse estatísticas, odds e Meu Bilhete no LivaSports.com.'},
  ],
};

function hookHeadline(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,rank:number){
  return variant(row,channel,story,"hook",HOOK_FAMILIES[channel][story.angle],rank).replace('{match}',matchup(row));
}
function selectedCta(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,rank:number){
  const preferred:Partial<Record<GrowthStoryAngle,number[]>>={ODDS_GAP:[1,4],PLAYER_VS_PLAYER:[2,4],STAR_FOCUS:[2,4],TOP_MATCHES_TODAY:[1,3],WEEKEND_WATCHLIST:[1,3],TABLE_PRESSURE:[0,3,4]};
  const indexes=preferred[story.angle]??CTA_VARIANTS[channel].map((_,index)=>index),index=variant(row,channel,story,'cta',indexes,rank);
  return CTA_VARIANTS[channel][index]!;
}

/**
 * Table language, in pools rather than one fixed sentence per branch. Every line states only what the
 * stored table actually says — a position, a gap, a zone — in the way Brazilian football media says it.
 */
const TABLE_LINES={
  bothTop:[
    'Duelo direto no G4. Cada ponto pesa na parte de cima.',
    'Os dois chegam no pelotão da frente: a rodada mexe com o G4.',
    'Confronto de cima contra cima — e o G4 sente o resultado.',
    'Dois times do topo se enfrentam, e a diferença é mínima.',
    'A parte de cima da tabela se decide em jogos como este.',
  ],
  oneTop:[
    '{team} chega no G4 e defende posição nesta rodada.',
    '{team} entra em campo dentro do G4, com vaga em disputa.',
    'Para {team}, a rodada vale manutenção no pelotão da frente.',
    '{team} está no grupo de cima e joga para continuar lá.',
    'O G4 passa por {team} — e por este resultado.',
    '{team} aparece entre os primeiros e trata a rodada como decisão.',
  ],
  oneBottom:[
    '{team} começa na parte de baixo e entra em campo sob pressão.',
    'A zona de baixo aperta, e {team} precisa pontuar.',
    'Para {team}, cada ponto pesa contra a queda.',
    '{team} chega pressionado pela parte debaixo da tabela.',
    'A rodada pode ser decisiva para {team} lá embaixo.',
  ],
  tight:[
    'Só {gap} {word} os times antes da rodada.',
    'Separados por {gap} {word}: o confronto é direto na classificação.',
    'A tabela coloca os dois lado a lado — {gap} {word} de diferença.',
    'Com {gap} {word} entre eles, o duelo vale posição na classificação.',
  ],
  neutral:[
    'A tabela dá peso real a este confronto.',
    'Classificação e contexto colocam este jogo no radar.',
    'É um confronto que mexe com a tabela dos dois lados.',
    'Um duelo com leitura clara na classificação.',
  ],
} as const;

function tablePressureLead(row:RankedGrowthFixture,pick:(values:readonly string[],kind:string)=>string){
  const table=row.signals.standings;
  if(!table||table.homePosition===null||table.awayPosition===null)return pick(TABLE_LINES.neutral,'table-neutral');
  const home=table.homePosition,away=table.awayPosition,total=table.totalTeams;
  if(home<=4&&away<=4)return pick(TABLE_LINES.bothTop,'table-both');
  if(home<=4||away<=4)return pick(TABLE_LINES.oneTop,'table-top').replace('{team}',home<=4?row.signals.home.name:row.signals.away.name);
  if(total!==null&&(home>total-4||away>total-4))return pick(TABLE_LINES.oneBottom,'table-bottom').replace('{team}',home>total-4?row.signals.home.name:row.signals.away.name);
  const gap=Math.abs(home-away);
  if(gap<=3)return pick(TABLE_LINES.tight,'table-tight').replace('{gap}',String(gap)).replace('{word}',gap===1?'posição separa':'posições separam');
  return pick(TABLE_LINES.neutral,'table-neutral');
}

/** One pool per story angle, so two fixtures telling the same kind of story still read differently. */
const STORY_LINES:Record<GrowthStoryAngle,readonly string[]>={
  DERBY_RIVALRY:[
    '{rival}: rivalidade e contexto real em campo.',
    '{rival} é daqueles jogos que param a rodada.',
    'Clássico é capítulo à parte — e {rival} prova isso.',
    'No {rival}, tabela e favoritismo contam menos.',
    '{rival}: história, pressão e um jogo só.',
  ],
  PLAYER_VS_PLAYER:[
    '{p1} de um lado. {p2} do outro.',
    'Dois nomes em evidência: {p1} e {p2}.',
    '{p1} e {p2} chegam com números para sustentar o duelo.',
    'O confronto ganha outro peso com {p1} e {p2} em campo.',
  ],
  STAR_FOCUS:[
    '{p1} é o nome para acompanhar neste {match}.',
    'Os olhos vão para {p1} em {match}.',
    '{p1} chega com números que explicam a atenção.',
    'Se {match} tem um protagonista, é {p1}.',
  ],
  TABLE_PRESSURE:[],
  ODDS_GAP:[
    'O mesmo mercado aparece com preços diferentes.',
    'Mesma partida, mesmo mercado — e preços que não batem.',
    'A diferença entre as casas muda o valor da mesma aposta.',
    'Comparar antes de escolher muda o preço final.',
    'Preços distintos para o mesmo resultado: vale conferir.',
  ],
  TOP_MATCHES_TODAY:[
    'Os jogos que lideram a agenda brasileira de hoje.',
    'A agenda de hoje concentrada em cinco confrontos.',
    'O que realmente pede atenção na rodada de hoje.',
    'Cinco jogos para organizar o seu dia de futebol.',
  ],
  WEEKEND_WATCHLIST:[
    'Jogo para colocar no radar desta rodada.',
    'Um confronto que merece espaço na sua rodada.',
    'Entra na lista de quem acompanha a rodada de perto.',
    'Daqueles jogos que passam batido — e não deveriam.',
    'Vale reservar um tempo para {match} nesta rodada.',
    'Um duelo discreto na tabela, interessante no campo.',
  ],
  BIG_MATCH:[
    'Jogaço: {match}.',
    '{match} é o tipo de confronto que define rodada.',
    'Poucos jogos da rodada pesam como {match}.',
    '{match} chega com tamanho de decisão.',
    'O calendário reservou {match} para esta rodada.',
  ],
};

function storyLead(row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],
  pick:(values:readonly string[],kind:string)=>string){
  if(story.angle==='TABLE_PRESSURE')return tablePressureLead(row,pick);
  const pool=STORY_LINES[story.angle];
  const line=pool.length?pick(pool,`story-${story.angle}`):`${matchup(row)} entrou na nossa lista para acompanhar.`;
  return line
    .replace('{match}',matchup(row))
    .replace('{rival}',row.priority.rivalry??matchup(row))
    .replace('{p1}',players[0]?.name??row.signals.home.name)
    .replace('{p2}',players[1]?.name??row.signals.away.name);
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

function plan(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],hook:string,cta:{headline:string;copy:string},topSocial:RankedGrowthFixture[],rank:number):GrowthVideoScene[]{
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
    ['HOOK',platformHeadlines[0],storyLead(row,story,players,(values,kind)=>variant(row,channel,story,kind,[...values],rank)),transitions[0]],
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

function platformText(channel:GrowthVideoChannel,row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],topSocial:RankedGrowthFixture[],rank:number):GrowthPlatformDraft{
  const match=matchup(row),time=kickoff(row.signals.kickoff),lead=storyLead(row,story,players,(values,kind)=>variant(row,channel,story,kind,[...values],rank)),context=truthfulMatchContext(row);
  const opening=hookHeadline(channel,row,story,rank),cta=selectedCta(channel,row,story,rank);
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
  return {channel,...content,hashtags,cta:cta.copy,template:story.template,scenes:plan(channel,row,story,players,opening,cta,topSocial,rank)};
}

export function platformDrafts(row:RankedGrowthFixture,story:GrowthStorySelection,players:GrowthSelectedPlayer[],topSocial:RankedGrowthFixture[],rank=1):Record<GrowthVideoChannel,GrowthPlatformDraft>{
  return {TIKTOK:platformText('TIKTOK',row,story,players,topSocial,rank),INSTAGRAM_REELS:platformText('INSTAGRAM_REELS',row,story,players,topSocial,rank),YOUTUBE_SHORTS:platformText('YOUTUBE_SHORTS',row,story,players,topSocial,rank)};
}

/** Optional future voice providers plug in here; V1.1 always renders complete mute-first videos without one. */
export interface GrowthVoiceoverProvider {kind:string;renderPtBr(text:string):Promise<Buffer>;}
