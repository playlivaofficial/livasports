import type {NewsDraft,PublishedNews} from './model';

export const newsLanguages=['en','es','pt'] as const;
export type NewsLanguage=typeof newsLanguages[number];
export interface TranslationReview {state:'pending'|'reviewed'|'validated'|'unavailable';reviewedAt:string|null}
export type TranslationReviews=Record<NewsLanguage,TranslationReview>;
export const newsLanguageNames:Record<NewsLanguage,string>={en:'English',es:'Español',pt:'Português'};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const has=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const text=(value:unknown,min:number,max:number):value is string=>typeof value==='string'&&value.trim().length>=min&&value.length<=max&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

/** Only records with both fields absent are legacy. Partial/unknown metadata fails closed. */
export function validTranslationMetadata(value:unknown):boolean {
  if(!record(value))return false;
  if(!has(value,'originalLanguage')&&!has(value,'translationReview'))return true;
  if(!newsLanguages.includes(value.originalLanguage as NewsLanguage)||!record(value.translationReview))return false;
  const reviews=value.translationReview;
  if(Object.keys(reviews).length!==3||!Object.keys(reviews).every(key=>newsLanguages.includes(key as NewsLanguage)))return false;
  return newsLanguages.every(language=>{
    const review=reviews[language];
    return record(review)&&Object.keys(review).length===2&&Object.keys(review).every(key=>key==='state'||key==='reviewedAt')&&
      (review.state==='reviewed'||review.state==='validated'?timestamp(review.reviewedAt):(review.state==='pending'||review.state==='unavailable')&&review.reviewedAt===null)&&
      (language!==value.originalLanguage||review.state!=='unavailable');
  });
}
export function availableNewsLanguages(draft:NewsDraft):NewsLanguage[]{
  if(!validTranslationMetadata(draft))return [];
  return newsLanguages.filter(language=>!draft.translationReview||draft.translationReview[language].state!=='unavailable');
}
/** Every field remains a bounded three-key object; unavailable text must be explicitly empty. */
export function newsTextTranslations(draft:NewsDraft,field:'title'|'summary'|'body'|'imageCaption',min:number,max:number):boolean {
  const value:unknown=draft[field];
  return validTranslationMetadata(draft)&&record(value)&&Object.keys(value).length===3&&Object.keys(value).every(key=>newsLanguages.includes(key as NewsLanguage))&&newsLanguages.every(language=>
    draft.translationReview?.[language].state==='unavailable'?value[language]==='':text(value[language],min,max));
}
export function resetTranslationReviews(draft:NewsDraft):NewsDraft {
  if(!draft.translationReview)return draft;
  return {...draft,translationReview:Object.fromEntries(newsLanguages.map(language=>[language,{state:draft.translationReview![language].state==='unavailable'?'unavailable':'pending',reviewedAt:null}])) as TranslationReviews};
}
export function declareOriginalNewsLanguage(draft:NewsDraft,language:NewsLanguage):NewsDraft {
  const translationReview=Object.fromEntries(newsLanguages.map(value=>[value,{state:value!==language&&draft.translationReview?.[value].state==='unavailable'?'unavailable':'pending',reviewedAt:null}])) as TranslationReviews;
  return {...draft,originalLanguage:language,translationReview};
}
/** Called only after the Owner confirms removal of this translation's draft text. */
export function setNewsTranslationAvailable(draft:NewsDraft,language:NewsLanguage,available:boolean):NewsDraft {
  if(!draft.translationReview||(!available&&draft.originalLanguage===language))return draft;
  const next=resetTranslationReviews(draft);
  return {...next,translationReview:{...next.translationReview!,[language]:{state:available?'pending':'unavailable',reviewedAt:null}},...(!available?{title:{...next.title,[language]:''},summary:{...next.summary,[language]:''},body:{...next.body,[language]:''},imageCaption:{...next.imageCaption,[language]:''}}:{})};
}
export function reviewNewsTranslations(draft:NewsDraft,reviewedAt:string):NewsDraft {
  if(!draft.translationReview)return draft;
  return {...draft,translationReview:Object.fromEntries(newsLanguages.map(language=>[language,draft.translationReview![language].state==='unavailable'?{state:'unavailable',reviewedAt:null}:{state:'reviewed',reviewedAt}])) as TranslationReviews};
}
export function translationReviewMatches(draft:NewsDraft,reviewedAt:string|null):boolean {
  if(!validTranslationMetadata(draft))return false;
  if(!draft.translationReview)return true;
  return !!reviewedAt&&availableNewsLanguages(draft).every(language=>['reviewed','validated'].includes(draft.translationReview![language].state)&&draft.translationReview![language].reviewedAt===reviewedAt);
}

export interface ResolvedNewsTranslation {
  language:NewsLanguage;originalLanguage:NewsLanguage|null;fallback:boolean;availableLanguages:NewsLanguage[];
  title:string;summary:string;body:string;imageCaption:string;
}
const completeLanguage=(item:PublishedNews,language:NewsLanguage)=>text(item.title?.[language],10,160)&&text(item.summary?.[language],30,500)&&text(item.body?.[language],40,12000)&&text(item.imageCaption?.[language],item.image==='none'?0:12,350);
/** Never mixes languages or treats pending text as public. Legacy originals are not inferred. */
export function resolveNewsTranslation(item:PublishedNews,requestedLanguage:NewsLanguage):ResolvedNewsTranslation|null {
  if(!validTranslationMetadata(item)||!newsLanguages.includes(requestedLanguage))return null;
  const availableLanguages=newsLanguages.filter(language=>completeLanguage(item,language)&&(!item.translationReview||(['reviewed','validated'].includes(item.translationReview[language].state)&&item.translationReview[language].reviewedAt===item.verifiedAt)));
  const originalLanguage=item.originalLanguage??null;
  if(originalLanguage&&!availableLanguages.includes(originalLanguage))return null;
  const language=availableLanguages.includes(requestedLanguage)?requestedLanguage:originalLanguage&&availableLanguages.includes(originalLanguage)?originalLanguage:null;
  if(!language)return null;
  return {language,originalLanguage,fallback:language!==requestedLanguage,availableLanguages,title:item.title[language],summary:item.summary[language],body:item.body[language],imageCaption:item.imageCaption[language]};
}
