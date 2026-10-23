import {newsCountries,newsCompetitions,newsSports,topicsForSport,type NewsCountry,type NewsCompetition,type NewsSport} from './model';
export interface NewsFeedFilters {sport:NewsSport|'all';topic:NewsCompetition|'all';country:NewsCountry|'all'}
const keys={sport:'newsSport',topic:'newsTopic',country:'newsCountry'} as const;
/** These parameters filter reporting only; they are never trusted geographic preferences. */
export function newsFeedFilters(search:string,initialSport:NewsSport|'all'='all'):NewsFeedFilters{
 const query=new URLSearchParams(search),sportValue=query.get(keys.sport),topicValue=query.get(keys.topic),countryValue=query.get(keys.country);
 const sport=typeof sportValue==='string'&&newsSports.includes(sportValue as NewsSport)?sportValue as NewsSport:sportValue==='all'?'all':initialSport;
 const topic=typeof topicValue==='string'&&newsCompetitions.includes(topicValue as NewsCompetition)&&(sport==='all'||topicsForSport(sport).includes(topicValue as NewsCompetition))?topicValue as NewsCompetition:'all';
 const country=typeof countryValue==='string'&&newsCountries.includes(countryValue as NewsCountry)?countryValue as NewsCountry:'all';
 return {sport,topic,country};
}
export function newsFeedSearch(search:string,filters:NewsFeedFilters):string{
 const query=new URLSearchParams(search);
 for(const key of Object.keys(keys) as (keyof NewsFeedFilters)[]){if(key!=='sport'&&filters[key]==='all')query.delete(keys[key]);else query.set(keys[key],filters[key]);}
 const result=query.toString();return result?'?'+result:'';
}
