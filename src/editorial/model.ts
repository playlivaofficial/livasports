import type {Translation} from '@/v2/content';

export const newsCountries=['mx','co','pe','international'] as const;
export type NewsCountry=typeof newsCountries[number];
export const newsCompetitions=['liga-mx','colombia-primera-a','peru-liga-1','copa-libertadores','champions-league','premier-league','la-liga','serie-a','bundesliga','national-teams','grassroots'] as const;
export const imageIds=['none','azteca','campin'] as const;
export interface NewsDraft {
  slug:string; country:NewsCountry; competition:typeof newsCompetitions[number];
  title:Translation; summary:Translation; body:Translation;
  sourceName:string; sourceUrl:string; sourcePublishedOn:string;
  image:typeof imageIds[number]; imageCaption:Translation; featured:boolean;
}
export interface PublishedNews extends NewsDraft {publishedAt:string;updatedAt:string;verifiedAt:string}
export interface NewsRecord {slug:string;draft:NewsDraft;published:PublishedNews|null;revision:number;reviewedRevision:number|null;reviewedAt:string|null;archived:boolean}
export const officialSourceHosts=['fmf.mx','miseleccion.mx','ligamx.net','dimayor.com.co','fpf.org.pe','liga1.pe','fifa.com','inside.fifa.com','conmebol.com','uefa.com','premierleague.com','laliga.com','legaseriea.it','bundesliga.com','theifab.com'] as const;

export function validSourceUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>1000)return false;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&officialSourceHosts.some(host=>url.hostname===host||url.hostname===`www.${host}`);}catch{return false;}
}
const plain=(value:unknown,min:number,max:number):value is string=>typeof value==='string'&&value.trim().length>=min&&value.length<=max&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const translations=(value:unknown,min:number,max:number)=>!!value&&typeof value==='object'&&['en','es','pt'].every(lang=>plain((value as Record<string,unknown>)[lang],min,max));
export function validateNewsDraft(value:unknown,now=new Date()):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value))return ['Invalid editorial record.'];
  const d=value as NewsDraft,errors:string[]=[];
  if(Object.keys(d).some(key=>!['slug','country','competition','title','summary','body','sourceName','sourceUrl','sourcePublishedOn','image','imageCaption','featured'].includes(key)))errors.push('Unknown editorial field.');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug??'')||d.slug.length>100)errors.push('Use a stable lowercase slug, up to 100 characters.');
  if(!newsCountries.includes(d.country))errors.push('Choose an editorial country.');
  if(!newsCompetitions.includes(d.competition))errors.push('Choose a competition or topic.');
  if(!translations(d.title,10,160))errors.push('A headline of 10–160 characters is required in EN, ES and PT.');
  if(!translations(d.summary,30,500))errors.push('An original summary of 30–500 characters is required in every language.');
  if(!translations(d.body,40,12000))errors.push('Original body text of 40–12,000 characters is required in every language.');
  if(!plain(d.sourceName,2,80)||!validSourceUrl(d.sourceUrl))errors.push('Use a named official source and a clean HTTPS article URL from the approved source list.');
  const date=new Date(`${d.sourcePublishedOn}T00:00:00.000Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.sourcePublishedOn??'')||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==d.sourcePublishedOn||date.getTime()>now.getTime())errors.push('Use the verified source publication date, not a future or invented date.');
  if(!imageIds.includes(d.image))errors.push('Choose a rights-reviewed local image or no photograph.');
  if(d.image!=='none'&&!translations(d.imageCaption,12,350))errors.push('Describe the archive photograph accurately in all languages. Do not imply it depicts this news event.');
  if(d.image==='azteca'&&d.country!=='mx')errors.push('The Azteca photograph is only appropriate for Mexico coverage.');
  if(d.image==='campin'&&d.country!=='co')errors.push('The El Campín photograph is only appropriate for Colombia coverage.');
  if(typeof d.featured!=='boolean')errors.push('Invalid featured state.');
  return errors;
}
/** Drafts may be incomplete, but may never contain arbitrary markup, URLs or unbounded fields. */
export function safeNewsDraft(value:unknown):value is NewsDraft {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const d=value as NewsDraft;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug??'')&&d.slug.length<=100&&newsCountries.includes(d.country)&&newsCompetitions.includes(d.competition)&&imageIds.includes(d.image)&&typeof d.featured==='boolean'&&translations(d.title,0,160)&&translations(d.summary,0,500)&&translations(d.body,0,12000)&&translations(d.imageCaption,0,350)&&plain(d.sourceName,0,80)&&(d.sourceUrl===''||validSourceUrl(d.sourceUrl))&&typeof d.sourcePublishedOn==='string'&&/^(?:\d{4}-\d{2}-\d{2})?$/.test(d.sourcePublishedOn)&&Object.keys(d).every(key=>['slug','country','competition','title','summary','body','sourceName','sourceUrl','sourcePublishedOn','image','imageCaption','featured'].includes(key));
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
    return {...record,draft,revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  }
  if(action==='review'){
    if(validateNewsDraft(record.draft,now).length)throw new Error('INVALID_DRAFT');
    return {...record,reviewedRevision:record.revision,reviewedAt:now.toISOString()};
  }
  if(action==='archive')return {...record,archived:true,revision:record.revision+1,reviewedRevision:null,reviewedAt:null};
  if(record.reviewedRevision!==record.revision||!record.reviewedAt||now.getTime()-Date.parse(record.reviewedAt)>86400000||validateNewsDraft(record.draft,now).length)throw new Error('REVIEW_REQUIRED');
  const unchanged=record.published&&Object.keys(record.draft).every(key=>JSON.stringify(record.draft[key as keyof NewsDraft])===JSON.stringify(record.published![key as keyof NewsDraft]));
  return {...record,archived:false,published:{...record.draft,publishedAt:record.published?.publishedAt??now.toISOString(),updatedAt:unchanged?record.published!.updatedAt:now.toISOString(),verifiedAt:record.reviewedAt}};
}
