import Link from 'next/link';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {translated} from '@/v2/content';
import {newsSport,resolveNewsTranslation,type PublishedNews,type ResolvedNewsTranslation} from './model';
import {editorialAssets} from './assets';
import {countryName,newsCopy,newsDate,newsPath,topicName,sportName} from './copy';
import {usablePublishedNews} from './presentation';

export function NewsPhoto({id,locale,priority=false,className=''}:{id:keyof typeof editorialAssets;locale:InterfaceLocale;priority?:boolean;className?:string}){
  const asset=editorialAssets[id];
  return <picture className={`ed-photo ${className}`}><img src={`${asset.base}-1280.webp`} srcSet={`${asset.base}-640.webp 640w, ${asset.base}-1280.webp 1280w, ${asset.base}-1920.webp 1920w`} sizes="(max-width: 767px) 100vw, (max-width: 1200px) 65vw, 900px" width={asset.width} height={asset.height} alt={translated(asset.alt,locale)} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}/></picture>;
}
/** Credit links are siblings of story links, never nested inside them. */
export function PhotoCredit({id,locale,className=''}:{id:keyof typeof editorialAssets;locale:InterfaceLocale;className?:string}){
  const asset=editorialAssets[id],language=publicLanguage(locale);
  const notice={en:'Resized and converted to WebP; displayed crop may vary.',es:'Imagen redimensionada y convertida a WebP; el recorte mostrado puede variar.',pt:'Imagem redimensionada e convertida para WebP; o recorte exibido pode variar.'}[language];
  const license={en:'License',es:'Licencia',pt:'Licença'}[language];
  return <div className={`ed-photo-credit ${className}`} lang={language}><a href={asset.source} rel="noopener noreferrer">{asset.credit}</a> · <a href={asset.license} rel="noopener noreferrer">{license}</a><span> · {notice}</span></div>;
}
export function NewsLanguageNotice({translation,locale}:{translation:ResolvedNewsTranslation;locale:InterfaceLocale}){
  if(!translation.fallback)return null;
  const language=publicLanguage(locale),names={en:{en:'English',es:'Spanish',pt:'Portuguese'},es:{en:'inglés',es:'español',pt:'portugués'},pt:{en:'inglês',es:'espanhol',pt:'português'}}[language];
  const label=language==='en'?`Original in ${names[translation.language]}; ${names[language]} translation unavailable.`:language==='es'?`Original en ${names[translation.language]}; traducción al ${names[language]} no disponible.`:`Original em ${names[translation.language]}; tradução para ${names[language]} indisponível.`;
  return <span className="ed-language-notice" lang={language}>{label}</span>;
}
export function NewsCard({item,locale,lead=false,now=new Date()}:{item:PublishedNews;locale:InterfaceLocale;lead?:boolean;now?:Date}){
  if(!usablePublishedNews(item,now))return null;
  const text=newsCopy(locale),translation=resolveNewsTranslation(item,publicLanguage(locale));if(!translation)return null;
  return <article className={`ed-news-card ${lead?'ed-news-lead':''} ${item.image==='none'?'ed-news-type':''}`}>
    <Link href={newsPath(locale,item.slug)} className="ed-card-link">
      {item.image!=='none'?<NewsPhoto id={item.image} locale={locale}/>:<div className="ed-story-mark" aria-hidden="true"><span>{countryName(item.country,locale)}</span><strong>{topicName(item.competition,locale)}</strong><i>↗</i></div>}
      <div className="ed-card-copy"><span className="ed-kicker"><span className="ed-sport-tag">{sportName(newsSport(item),locale)}</span> <b>·</b> {countryName(item.country,locale)} <b>·</b> {topicName(item.competition,locale)}</span><NewsLanguageNotice translation={translation} locale={locale}/><h3 lang={translation.language}>{translation.title}</h3>{lead?<p lang={translation.language}>{translation.summary}</p>:null}<div className="ed-date"><span>{item.sourceName}</span><time dateTime={item.sourcePublishedOn}>{newsDate(item.sourcePublishedOn,locale)}</time></div>{lead?<span className="ed-read">{text.read} <b aria-hidden="true">↗</b></span>:null}</div>
    </Link>
    {item.image!=='none'?<PhotoCredit id={item.image} locale={locale}/>:null}
  </article>;
}
export function FeaturedNews({items,locale,now=new Date()}:{items:PublishedNews[];locale:InterfaceLocale;now?:Date}){
  const chosen=items.filter(item=>item.featured&&usablePublishedNews(item,now)&&resolveNewsTranslation(item,publicLanguage(locale))).sort((a,b)=>Number(b.image!=='none')-Number(a.image!=='none')).slice(0,4),text=newsCopy(locale);
  if(!chosen.length)return null;
  return <section className="v2-section ed-featured"><div className="v2-section-heading"><h2>{text.featured}</h2><Link className="v2-text-link" href={newsPath(locale)}>{text.view} ↗</Link></div><div className="ed-feature-grid"><NewsCard item={chosen[0]} locale={locale} now={now} lead/><div className="ed-supporting">{chosen.slice(1).map(item=><NewsCard key={item.slug} item={item} locale={locale} now={now}/>)}</div></div></section>;
}
export function selectFeaturedStory(items:readonly PublishedNews[],locale:InterfaceLocale,now=new Date()):PublishedNews|null{
  return items.filter(item=>item.featured&&item.image!=='none'&&Object.hasOwn(editorialAssets,item.image)&&usablePublishedNews(item,now)&&resolveNewsTranslation(item,publicLanguage(locale))).sort((a,b)=>b.sourcePublishedOn.localeCompare(a.sourcePublishedOn)||b.publishedAt.localeCompare(a.publishedAt)||a.slug.localeCompare(b.slug))[0]??null;
}
/** The lead is a real reviewed publication. Empty coverage deliberately yields no fabricated hero. */
export function FeaturedStoryHero({items,locale,now=new Date()}:{items:readonly PublishedNews[];locale:InterfaceLocale;now?:Date}){
  const item=selectFeaturedStory(items,locale,now);if(!item||item.image==='none')return null;
  const translation=resolveNewsTranslation(item,publicLanguage(locale))!,text=newsCopy(locale);
  return <section className="ed-featured-hero" aria-labelledby="featured-story-headline"><article className="ed-hero ed-story-hero"><NewsPhoto id={item.image} locale={locale} priority/><div className="ed-hero-shade"/><div className="ed-hero-content"><span className="ed-hero-eyebrow">{sportName(newsSport(item),locale)} · {topicName(item.competition,locale)}</span><NewsLanguageNotice translation={translation} locale={locale}/><h1 id="featured-story-headline" lang={translation.language}>{translation.title}</h1><p lang={translation.language}>{translation.summary}</p><div className="ed-hero-source"><a href={item.sourceUrl} rel="noopener noreferrer">{item.sourceName} ↗</a><time dateTime={item.sourcePublishedOn}>{newsDate(item.sourcePublishedOn,locale)}</time></div><div className="v2-hero-actions"><Link className="v2-button" href={newsPath(locale,item.slug)}>{text.read} ↗</Link></div></div></article><div className="ed-hero-photo-caption"><span lang={translation.language}>{translation.imageCaption}</span><PhotoCredit id={item.image} locale={locale}/></div></section>;
}
