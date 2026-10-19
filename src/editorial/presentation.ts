import {interfaceLocales,languageTags,publicLanguage,type InterfaceLocale} from '@/localization/interface';
import {newsPath} from './copy';
import {resolveNewsTranslation,validateNewsDraft,translationReviewMatches,type NewsLanguage,type PublishedNews} from './model';

const originalLocale:Record<NewsLanguage,InterfaceLocale>={en:'en',es:'mx',pt:'br'};
/** Missing translations are readable fallbacks, not separate indexable translations. */
export function newsTranslationRoutes(item:PublishedNews,locale:InterfaceLocale){
  const translation=resolveNewsTranslation(item,publicLanguage(locale));if(!translation)return null;
  const locales=interfaceLocales.filter(value=>translation.availableLanguages.includes(publicLanguage(value)));
  const fallbackLocale=translation.originalLanguage?originalLocale[translation.originalLanguage]:locales.includes('en')?'en':locales[0];
  const canonicalLocale=translation.fallback?fallbackLocale:locale;
  const paths=Object.fromEntries(locales.map(value=>[value,newsPath(value,item.slug)])) as Partial<Record<InterfaceLocale,string>>;
  const languages=Object.fromEntries(locales.map(value=>[languageTags[value],paths[value]!])) as Record<string,string>;
  languages['x-default']=paths.en??paths[fallbackLocale]!;
  return {translation,locales,paths,languages,canonical:newsPath(canonicalLocale,item.slug),indexable:!translation.fallback,contentLanguage:translation.fallback?translation.language:languageTags[locale]};
}
/** Input is a published snapshot, never a draft; dates and current source policy remain bounded. */
export function usablePublishedNews(item:PublishedNews,now:Date):boolean {
  const {publishedAt,updatedAt,verifiedAt,...draft}=item;
  const dates=[publishedAt,updatedAt,verifiedAt].map(value=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return NaN;
    const time=Date.parse(value);return Number.isFinite(time)&&(new Date(time).toISOString()===value||new Date(time).toISOString().replace('.000Z','Z')===value)?time:NaN;
  });
  return dates.every(value=>Number.isFinite(value)&&value<=now.getTime())&&dates[1]>=dates[0]&&validateNewsDraft(draft,now).length===0&&translationReviewMatches(draft,verifiedAt);
}
