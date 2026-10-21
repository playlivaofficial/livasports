import {hasCurrentReview,hasUnpublishedChanges,publicNewsFeed} from './coverage';
import {newsSport,newsSports,type NewsRecord,type NewsSport} from './model';

/** Discovery links, not feeds or syndication licences. Opening them is a manual editorial step. */
export const dailySourceDesks: Record<NewsSport, readonly {name:string;url:string}[]> = {
  football:[{name:'Liga MX',url:'https://ligamx.net/'},{name:'DIMAYOR',url:'https://www.dimayor.com.co/'},{name:'Liga1',url:'https://liga1.pe/'}],
  basketball:[{name:'NBA',url:'https://pr.nba.com/'},{name:'EuroLeague',url:'https://www.euroleaguebasketball.net/euroleague/news/'}],
  baseball:[{name:'MLB',url:'https://www.mlb.com/news/'}],
  'american-football':[{name:'NFL',url:'https://www.nfl.com/news/'}],
  'ice-hockey':[{name:'NHL',url:'https://www.nhl.com/news/'}],
  tennis:[{name:'ATP',url:'https://www.atptour.com/en/news'},{name:'WTA',url:'https://www.wtatennis.com/news'}],
  mma:[{name:'UFC',url:'https://www.ufc.com/news'}],
};

/** Read-only work queue. An old story republished today is never counted as today's news. */
export function dailyEditorialDesk(records:readonly NewsRecord[],now=new Date()){
  const today=now.toISOString().slice(0,10);
  return newsSports.map(sport=>{
    const active=records.filter(record=>!record.archived&&newsSport(record.draft)===sport);
    const pending=active.filter(hasUnpublishedChanges);
    const ready=pending.filter(record=>hasCurrentReview(record,now)).length;
    const publications=publicNewsFeed(records.flatMap(record=>!record.archived&&record.published?[record.published]:[]),{sport},now);
    const todayStories=publications.filter(item=>item.sourcePublishedOn===today).length;
    const latest=publications.map(item=>item.sourcePublishedOn).sort().at(-1)??null;
    return {sport,today,ready,needsReview:pending.length-ready,todayStories,latest,
      action:ready?'publish-reviewed':pending.length?'review-drafts':todayStories?'check-for-updates':'research' as const};
  });
}
