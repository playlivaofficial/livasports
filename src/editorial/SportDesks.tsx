import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {sportIds,sportName,sportsPath} from '@/multisport/catalog';
import {SportGlyph} from '@/multisport/SportGlyph';
import {newsSport,type PublishedNews} from './model';
import {usablePublishedNews} from './presentation';
import {NewsCard} from './NewsCards';
/** Empty sports do not acquire fictional headlines or a false claim of active coverage. */
export function SportDesks({items,locale}:{items:PublishedNews[];locale:InterfaceLocale}){
 return <div className="v3-sport-desks">{sportIds.filter(sport=>sport!=='football').map(sport=>{const stories=items.filter(item=>newsSport(item)===sport&&usablePublishedNews(item,new Date())).slice(0,3);if(!stories.length)return null;return <section key={sport} className="v2-section"><div className="v2-section-heading"><h2><SportGlyph sport={sport}/>{sportName(sport,locale)}</h2><Link href={sportsPath(locale,sport)}>↗</Link></div><div className="v3-desk-cards">{stories.map(story=><NewsCard key={story.slug} item={story} locale={locale}/>)}</div></section>;})}</div>;
}
