import type {InterfaceLocale} from '@/localization/interface';
import {tr,translated} from '@/v2/content';
import {leagues} from '@/v2/leagues';
import type {NewsCountry,NewsSport} from './model';
import {footballTopics,otherSportTopics} from './taxonomy';
export const newsPath=(locale:InterfaceLocale,slug?:string)=>`/${locale}/${locale==='en'?'news':'noticias'}${slug?'/'+slug:''}`;
export const newsCopy=(locale:InterfaceLocale)=>Object.fromEntries(Object.entries({
  news:tr('News','Noticias','Notícias'),featured:tr('In focus','En portada','Em destaque'),latest:tr('Latest sports news','Últimas noticias','Últimas notícias'),archive:tr('News & analysis','Noticias y análisis','Notícias e análises'),
  sport:tr('Sport','Deporte','Esporte'),allSports:tr('All sports','Todos los deportes','Todos os esportes'),
  lead:tr('The stories that matter. Verified sources, a wider perspective.','Las historias que importan. Fuentes verificadas, otra perspectiva.','As histórias que importam. Fontes verificadas, outra perspectiva.'),
  all:tr('All editions','Todas las ediciones','Todas as edições'),competition:tr('Competition / topic','Competición / tema','Competição / tema'),allTopics:tr('All topics','Todos los temas','Todos os temas'),more:tr('More stories','Más noticias','Mais notícias'),empty:tr('No published stories in this selection yet.','Todavía no hay noticias publicadas en esta selección.','Ainda não há notícias publicadas nesta seleção.'),
  source:tr('Original source','Fuente original','Fonte original'),sourceDate:tr('Source published','Fecha de la fuente','Data da fonte'),published:tr('LivaSports published','Publicado en LivaSports','Publicado na LivaSports'),updated:tr('Updated','Actualizado','Atualizado'),verified:tr('Source reviewed','Fuente revisada','Fonte revisada'),credit:tr('Photo credit & license','Crédito y licencia de la foto','Crédito e licença da foto'),
  back:tr('All news','Todas las noticias','Todas as notícias'),read:tr('Read story','Leer noticia','Ler notícia'),editorial:tr('LivaSports editorial','Redacción LivaSports','Redação LivaSports'),brief:tr('Source-verified brief','Nota con fuente verificada','Nota com fonte verificada'),
  original:tr('An original LivaSports summary. Follow the primary source for the full announcement.','Un resumen original de LivaSports. Consulta el anuncio completo en la fuente primaria.','Um resumo original da LivaSports. Consulte o comunicado completo na fonte primária.'),
  photo:tr('Old Trafford · Manchester · archive photograph','Old Trafford · Manchester · fotografía de archivo','Old Trafford · Manchester · fotografia de arquivo'),
  heroLead:tr('Football.','El fútbol.','O futebol.'),heroAccent:tr('Lived. Understood.','Se vive. Se entiende.','Se vive. Se entende.'),heroText:tr('Stories, ideas and a closer look at the game. From Latin America to the world.','Historias, ideas y otra mirada al juego. De Latinoamérica al mundo.','Histórias, ideias e um olhar mais atento ao jogo. Da América Latina para o mundo.'),
  explore:tr('Explore the stories','Explorar noticias','Explorar notícias'),view:tr('View all','Ver todas','Ver todas'),analysis:tr('Beyond the score','Más allá del marcador','Além do placar'),
}).map(([key,value])=>[key,translated(value,locale)])) as Record<'news'|'featured'|'latest'|'archive'|'lead'|'all'|'competition'|'allTopics'|'sport'|'allSports'|'more'|'empty'|'source'|'sourceDate'|'published'|'updated'|'verified'|'credit'|'back'|'read'|'editorial'|'brief'|'original'|'photo'|'heroLead'|'heroAccent'|'heroText'|'explore'|'view'|'analysis',string>;
export function countryName(country:NewsCountry,locale:InterfaceLocale){return translated({mx:tr('Mexico','México','México'),co:tr('Colombia','Colombia','Colômbia'),pe:tr('Peru','Perú','Peru'),international:tr('International','Internacional','Internacional')}[country],locale);}
export function sportName(sport:NewsSport,locale:InterfaceLocale){return translated({football:tr('Football','Fútbol','Futebol'),basketball:tr('Basketball','Baloncesto','Basquete'),baseball:tr('Baseball','Béisbol','Beisebol'),'american-football':tr('American football','Fútbol americano','Futebol americano'),'ice-hockey':tr('Ice hockey','Hockey sobre hielo','Hóquei no gelo'),mma:tr('MMA','MMA','MMA'),tennis:tr('Tennis','Tenis','Tênis')}[sport],locale);}
export function topicName(id:string,locale:InterfaceLocale){
  if(id==='grassroots')return translated(tr('Grassroots','Fútbol base','Futebol de base'),locale);
  if(id==='national-teams')return translated(tr('National teams','Selecciones','Seleções'),locale);
  return leagues.find(league=>league.id===id)?.name??(Object.hasOwn(footballTopics,id)?footballTopics[id as keyof typeof footballTopics]:Object.hasOwn(otherSportTopics,id)?otherSportTopics[id as keyof typeof otherSportTopics].name:id);
}
export function newsDate(value:string,locale:InterfaceLocale){return new Intl.DateTimeFormat(locale==='en'?'en-GB':locale==='br'?'pt-BR':'es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));}
