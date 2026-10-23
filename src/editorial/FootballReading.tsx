import Link from 'next/link';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {articles,translated,readingMinutes} from '@/v2/content';
import {v2Path} from '@/v2/routes';
import {EditorialArt} from '@/v2/Art';
/** Evergreen analysis is labelled separately from dated news. */
export function FootballReading({locale}:{locale:InterfaceLocale}){
 const lang=publicLanguage(locale),title={en:'Understand the game',es:'Entiende el juego',pt:'Entenda o jogo'}[lang];
 return <section className="lp-reading"><h2>{title}</h2><div>{articles.filter(item=>['understanding-4-3-3','league-and-knockout'].includes(item.id)).map(item=><Link key={item.id} href={v2Path(locale,item.category,item.id)}><EditorialArt kind={item.art}/><span><small>{{en:'Football guide',es:'Guía de fútbol',pt:'Guia de futebol'}[lang]} · {readingMinutes(item,locale)} min</small><strong>{translated(item.title,locale)}</strong></span><b aria-hidden="true">↗</b></Link>)}</div></section>;
}
