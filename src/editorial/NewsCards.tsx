import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {translated} from '@/v2/content';
import type {PublishedNews} from './model';
import {editorialAssets} from './assets';
import {countryName,newsCopy,newsDate,newsPath,topicName} from './copy';

export function NewsPhoto({id,locale,priority=false,className=''}:{id:keyof typeof editorialAssets;locale:InterfaceLocale;priority?:boolean;className?:string}){
  const asset=editorialAssets[id];
  return <picture className={`ed-photo ${className}`}><img src={`${asset.base}-1280.webp`} srcSet={`${asset.base}-640.webp 640w, ${asset.base}-1280.webp 1280w, ${asset.base}-1920.webp 1920w`} sizes="(max-width: 767px) 100vw, (max-width: 1200px) 65vw, 900px" width={asset.width} height={asset.height} alt={translated(asset.alt,locale)} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}/></picture>;
}
export function NewsCard({item,locale,lead=false}:{item:PublishedNews;locale:InterfaceLocale;lead?:boolean}){
  const text=newsCopy(locale);
  return <article className={`ed-news-card ${lead?'ed-news-lead':''} ${item.image==='none'?'ed-news-type':''}`}>
    <Link href={newsPath(locale,item.slug)} className="ed-card-link">
      {item.image!=='none'?<NewsPhoto id={item.image} locale={locale}/>:<div className="ed-story-mark" aria-hidden="true"><span>{countryName(item.country,locale)}</span><strong>{topicName(item.competition,locale)}</strong><i>↗</i></div>}
      <div className="ed-card-copy"><span className="ed-kicker">{countryName(item.country,locale)} <b>·</b> {topicName(item.competition,locale)}</span><h3>{translated(item.title,locale)}</h3>{lead?<p>{translated(item.summary,locale)}</p>:null}<div className="ed-date"><span>{item.sourceName}</span><time dateTime={item.sourcePublishedOn}>{newsDate(item.sourcePublishedOn,locale)}</time></div>{lead?<span className="ed-read">{text.read} <b aria-hidden="true">↗</b></span>:null}</div>
    </Link>
  </article>;
}
export function FeaturedNews({items,locale}:{items:PublishedNews[];locale:InterfaceLocale}){
  const chosen=items.filter(item=>item.featured).sort((a,b)=>Number(b.image!=='none')-Number(a.image!=='none')).slice(0,4),text=newsCopy(locale);
  if(!chosen.length)return null;
  return <section className="v2-section ed-featured"><div className="v2-section-heading"><h2>{text.featured}</h2><Link className="v2-text-link" href={newsPath(locale)}>{text.view} ↗</Link></div><div className="ed-feature-grid"><NewsCard item={chosen[0]} locale={locale} lead/><div className="ed-supporting">{chosen.slice(1).map(item=><NewsCard key={item.slug} item={item} locale={locale}/>)}</div></div></section>;
}
