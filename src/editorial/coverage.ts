import {isRecentNews,newsSport,newsSports,sameNewsContent,translationReviewMatches,type NewsCountry,type NewsCompetition,type NewsRecord,type NewsSport,type PublishedNews} from './model';
import {usablePublishedNews} from './presentation';

export interface NewsFilters {sport?:NewsSport|'all';country?:NewsCountry|'all';topic?:NewsCompetition|'all'}
/** Applies only to already published input; it does not fetch, synthesize or publish stories. */
export function publicNewsFeed(items:readonly PublishedNews[],filters:NewsFilters={},now=new Date()):PublishedNews[]{
  return items.filter(item=>usablePublishedNews(item,now)&&(!filters.sport||filters.sport==='all'||newsSport(item)===filters.sport)&&(!filters.country||filters.country==='all'||item.country===filters.country)&&(!filters.topic||filters.topic==='all'||item.competition===filters.topic));
}
export function hasUnpublishedChanges(record:NewsRecord):boolean {
  return !record.published||!sameNewsContent(record.draft,record.published);
}
export function hasCurrentReview(record:NewsRecord,now:Date):boolean {
  const reviewed=Date.parse(record.reviewedAt??'');
  return record.reviewedRevision===record.revision&&Number.isFinite(reviewed)&&reviewed<=now.getTime()&&now.getTime()-reviewed<=86400000&&translationReviewMatches(record.draft,record.reviewedAt);
}
/** Metrics are explicitly scoped to the owner collection supplied by the caller. */
export function newsroomCoverage(records:readonly NewsRecord[],now=new Date()){
  return newsSports.map(sport=>{
    const drafts=records.filter(record=>!record.archived&&newsSport(record.draft)===sport);
    const pending=drafts.filter(hasUnpublishedChanges);
    const publications=records.flatMap(record=>!record.archived&&record.published&&newsSport(record.published)===sport?[record.published]:[]);
    const recent=publications.filter(item=>isRecentNews(item,now));
    return {sport,drafts:drafts.length,reviewQueue:pending.filter(record=>!hasCurrentReview(record,now)).length,readyToPublish:pending.filter(record=>hasCurrentReview(record,now)).length,published:publications.length,recent:recent.length,
      lastPublishedAt:publications.map(item=>item.publishedAt).sort().at(-1)??null,
      latestSourcePublishedOn:publications.map(item=>item.sourcePublishedOn).sort().at(-1)??null,
      missingCoverage:publications.length===0,staleCoverage:publications.length>0&&recent.length===0,sourceStatus:'Source not checked' as const};
  });
}
