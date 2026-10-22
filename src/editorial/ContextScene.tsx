import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {NewsPhoto,PhotoCredit} from './NewsCards';
import {newsSport,type PublishedNews} from './model';
/** Context, not event evidence. Never infer a venue or participant from an archive photograph. */
export function contextScene(item:PublishedNews){
 if(item.image!=='none')return null;
 const sport=newsSport(item);
 if(sport==='football'&&item.country==='co')return {id:'campin' as const,label:{en:'Colombian football · Archive view of El Campín, Bogotá. Not the reported event.',es:'Fútbol colombiano · Vista de archivo de El Campín, Bogotá. No corresponde al evento narrado.',pt:'Futebol colombiano · Vista de arquivo de El Campín, Bogotá. Não é o evento noticiado.'}};
 if(sport==='basketball')return {id:'basketball-arena' as const,label:{en:'Basketball · Target Center, 2008. Archive photograph, not this event.',es:'Baloncesto · Target Center, 2008. Fotografía de archivo, no de este evento.',pt:'Basquete · Target Center, 2008. Fotografia de arquivo, não deste evento.'}};
 return null;
}
export function ContextScene({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
 const scene=contextScene(item);if(!scene)return null;
 return <figure className="v3-context-scene"><NewsPhoto id={scene.id} locale={locale}/><figcaption><span>{scene.label[publicLanguage(locale)]}</span><PhotoCredit id={scene.id} locale={locale}/></figcaption></figure>;
}
