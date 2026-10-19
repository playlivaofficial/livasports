import type {InterfaceLocale} from '@/localization/interface';
import {NewsCard} from '@/editorial/NewsCards';
import type {PublishedNews} from '@/editorial/model';
import {usablePublishedNews} from '@/editorial/presentation';
export function RegionalNews({items,locale,now=new Date()}:{items:PublishedNews[];locale:InterfaceLocale;now?:Date}){
 // Regional reporting is globally accessible. A language/route or obsolete browser value is not GEO.
 const regional=items.filter(item=>usablePublishedNews(item,now)&&['mx','co','pe'].includes(item.country)),chosen:PublishedNews[]=[];
 for(const country of ['mx','co','pe']){const story=regional.find(item=>item.country===country);if(story)chosen.push(story);}
 for(const story of regional)if(chosen.length<3&&!chosen.some(item=>item.slug===story.slug))chosen.push(story);
 if(!chosen.length)return null;
 return <section className="v2-section"><div className="v2-section-heading"><h2>{locale==='en'?'Across Latin America':locale==='br'?'Pela América Latina':'Por Latinoamérica'}</h2></div><div className="ms-news-grid">{chosen.map(item=><NewsCard key={item.slug} item={item} locale={locale} now={now}/>)}</div></section>;
}
