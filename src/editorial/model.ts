import type {Translation} from '@/v2/content';
import {newsCompetitions,newsSports,newsSport,competitionSport,type NewsSport,type NewsCompetition} from './taxonomy';
import {validSourceUrl} from './sources';
import {newsLanguages,validTranslationMetadata,newsTextTranslations,resetTranslationReviews,reviewNewsTranslations,translationReviewMatches,type NewsLanguage,type TranslationReviews} from './translations';
export {newsLanguages,newsLanguageNames,availableNewsLanguages,resetTranslationReviews,translationReviewMatches,resolveNewsTranslation,type NewsLanguage,type TranslationReviews,type ResolvedNewsTranslation} from './translations';
export {newsCompetitions,newsSports,newsSport,competitionSport,topicsForSport,type NewsSport,type NewsCompetition} from './taxonomy';
export {officialSourceHosts,editorialSourcePolicy,editorialSourceRegistry,validSourceUrl,canonicalSourceUrl} from './sources';

export const newsCountries=['mx','co','pe','international'] as const;
export type NewsCountry=typeof newsCountries[number];
export const imageIds=['none','azteca','campin','ufc-octagon','basketball-arena','tennis-court'] as const;
export interface NewsDraft {
  slug:string; country:NewsCountry; competition:NewsCompetition; sport?:NewsSport;
  title:Translation; summary:Translation; body:Translation;
  originalLanguage?:NewsLanguage; translationReview?:TranslationReviews;
  sourceName:string; sourceUrl:string; sourcePublishedOn:string;
  image:typeof imageIds[number]; imageCaption:Translation; featured:boolean;
}
export interface PublishedNews extends NewsDraft {publishedAt:string;updatedAt:string;verifiedAt:string}
export interface NewsRecord {slug:string;draft:NewsDraft;published:PublishedNews|null;revision:number;reviewedRevision:number|null;reviewedAt:string|null;archived:boolean}
const plain=(value:unknown,min:number,max:number):value is string=>typeof value==='string'&&value.trim().length>=min&&value.length<=max&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const draftFields=['slug','sport','country','competition','title','summary','body','sourceName','sourceUrl','sourcePublishedOn','image','imageCaption','featured','originalLanguage','translationReview'] as const;
const validCategory=(d:NewsDraft)=>(d.sport===undefined||newsSports.includes(d.sport))&&newsCompetitions.includes(d.competition)&&competitionSport(d.competition)===newsSport(d);
export function validateNewsDraft(value:unknown,now=new Date()):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value))return ['Invalid editorial record.'];
  const d=value as NewsDraft,errors:string[]=[];
  if(Object.keys(d).some(key=>!draftFields.includes(key as keyof NewsDraft)))errors.push('Unknown editorial field.');
  if(!validTranslationMetadata(d))errors.push('Declare an original language with valid review states for EN, ES and PT, or retain the legacy record without either field.');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug??'')||d.slug.length>100)errors.push('Use a stable lowercase slug, up to 100 characters.');
  if(!newsCountries.includes(d.country))errors.push('Choose an editorial country.');
  if(!newsCompetitions.includes(d.competition))errors.push('Choose a competition or topic.');
  if(!validCategory(d))errors.push('Choose a valid sport and a matching competition or topic.');
  if(!newsTextTranslations(d,'title',10,160))errors.push('A headline of 10–160 characters is required in every available language; unavailable translations must be empty.');
  if(!newsTextTranslations(d,'summary',30,500))errors.push('An original summary of 30–500 characters is required in every available language.');
  if(!newsTextTranslations(d,'body',40,12000))errors.push('Original body text of 40–12,000 characters is required in every available language.');
  if(!plain(d.sourceName,2,80)||!validSourceUrl(d.sourceUrl))errors.push('Use a named official source and a clean HTTPS article URL from the approved source list.');
  const date=new Date(`${d.sourcePublishedOn}T00:00:00.000Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.sourcePublishedOn??'')||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==d.sourcePublishedOn||date.getTime()>now.getTime())errors.push('Use the verified source publication date, not a future or invented date.');
  if(!imageIds.includes(d.image))errors.push('Choose a rights-reviewed local image or no photograph.');
  if(!newsTextTranslations(d,'imageCaption',d.image==='none'?0:12,350))errors.push('Describe the archive photograph accurately in every available language. Unavailable captions must be empty; do not imply the image depicts this news event.');
  if(d.image==='azteca'&&d.country!=='mx')errors.push('The Azteca photograph is only appropriate for Mexico coverage.');
  if(d.image==='campin'&&d.country!=='co')errors.push('The El Campín photograph is only appropriate for Colombia coverage.');
  const imageSports:Record<string,NewsSport>={azteca:'football',campin:'football','ufc-octagon':'mma','basketball-arena':'basketball','tennis-court':'tennis'};
  if(d.image!=='none'&&imageSports[d.image]!==newsSport(d))errors.push('Choose an archive photograph reviewed for this sport, or no photograph.');
  if(typeof d.featured!=='boolean')errors.push('Invalid featured state.');
  return errors;
}
/** Drafts may be incomplete, but may never contain arbitrary markup, URLs or unbounded fields. */
export function safeNewsDraft(value:unknown):value is NewsDraft {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const d=value as NewsDraft;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug??'')&&d.slug.length<=100&&newsCountries.includes(d.country)&&validCategory(d)&&imageIds.includes(d.image)&&typeof d.featured==='boolean'&&newsTextTranslations(d,'title',0,160)&&newsTextTranslations(d,'summary',0,500)&&newsTextTranslations(d,'body',0,12000)&&newsTextTranslations(d,'imageCaption',0,350)&&plain(d.sourceName,0,80)&&(d.sourceUrl===''||validSourceUrl(d.sourceUrl))&&typeof d.sourcePublishedOn==='string'&&/^(?:\d{4}-\d{2}-\d{2})?$/.test(d.sourcePublishedOn)&&Object.keys(d).every(key=>draftFields.includes(key as keyof NewsDraft));
}
/** Review stamps are evidence, not content edits. Availability/original-language changes are edits. */
export function sameNewsContent(left:NewsDraft,right:NewsDraft):boolean {
  return draftFields.every(key=>key==='sport'?newsSport(left)===newsSport(right):key==='translationReview'?JSON.stringify(left.translationReview&&newsLanguages.map(language=>left.translationReview![language].state==='unavailable'))===JSON.stringify(right.translationReview&&newsLanguages.map(language=>right.translationReview![language].state==='unavailable')):JSON.stringify(left[key])===JSON.stringify(right[key]));
}
export function isRecentNews(item:PublishedNews,now=new Date()):boolean {
  // Republishing old news never makes it recent. Both evidence and story must be recent.
  const source=Date.parse(item.sourcePublishedOn+'T00:00:00Z'),verified=Date.parse(item.verifiedAt);
  return source<=now.getTime()&&now.getTime()-source<7*86400000&&verified<=now.getTime()&&now.getTime()-verified<7*86400000;
}
export function publicNews(record:NewsRecord):PublishedNews|null{return record.archived?null:record.published;}
export function transitionNews(record:NewsRecord,action:'save'|'review'|'publish'|'archive',draft:NewsDraft|undefined,now=new Date()):NewsRecord {
  if(action==='save'){
    if(!draft||draft.slug!==record.slug)throw new Error('SLUG_IMMUTABLE');
    if(!safeNewsDraft(draft))throw new Error('INVALID_DRAFT');
    return {...record,draft:resetTranslationReviews(draft),revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  }
  if(action==='review'){
    if(validateNewsDraft(record.draft,now).length)throw new Error('INVALID_DRAFT');
    return {...record,draft:reviewNewsTranslations(record.draft,now.toISOString()),reviewedRevision:record.revision,reviewedAt:now.toISOString()};
  }
  if(action==='archive')return {...record,archived:true,revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  const reviewedTime=Date.parse(record.reviewedAt??'');
  if(record.reviewedRevision!==record.revision||!record.reviewedAt||!Number.isFinite(reviewedTime)||reviewedTime>now.getTime()||now.getTime()-reviewedTime>86400000||validateNewsDraft(record.draft,now).length||!translationReviewMatches(record.draft,record.reviewedAt))throw new Error('REVIEW_REQUIRED');
  const unchanged=record.published&&sameNewsContent(record.draft,record.published);
  return {...record,archived:false,published:{...record.draft,publishedAt:record.published?.publishedAt??now.toISOString(),updatedAt:unchanged?record.published!.updatedAt:now.toISOString(),verifiedAt:record.reviewedAt}};
}
