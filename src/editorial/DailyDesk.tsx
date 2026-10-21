import {dailyEditorialDesk,dailySourceDesks} from './daily-desk';
import {sportName} from './copy';
import type {NewsRecord,NewsSport} from './model';

export function DailyDesk({records,now,onStartStory}:{records:NewsRecord[];now:Date;onStartStory:(sport:NewsSport)=>void}){
  const queue=dailyEditorialDesk(records,now);
  return <section className="ed-daily-desk" aria-labelledby="daily-desk-heading">
    <div className="ed-desk-heading"><div><span className="ed-kicker">Manual editorial operation</span><h3 id="daily-desk-heading">Daily desk · {queue[0].today} UTC</h3></div><span className="ed-desk-status">7 sports · no auto-publishing</span></div>
    <p>Open the primary source, choose a genuinely new story, write an original brief and review each available language and image licence. Save → review → publish. The homepage updates without a deployment.</p>
    <div className="ed-desk-grid">{queue.map(item=><article key={item.sport} className="ed-desk-card">
      <h4>{sportName(item.sport,'en')}</h4><p className="ed-desk-next">{item.action==='publish-reviewed'?'Reviewed draft ready':item.action==='review-drafts'?'Draft review needed':item.action==='check-for-updates'?'Check for further updates':'Find and verify a story'}</p>
      <small>{item.todayStories} published with today’s source date · {item.ready} ready · {item.needsReview} awaiting review</small>
      <small>Latest source: {item.latest??'No publication'}</small>
      <nav aria-label={`${sportName(item.sport,'en')} primary sources`}>{dailySourceDesks[item.sport].map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>)}</nav>
      <button type="button" className="v2-button v2-button-outline" onClick={()=>onStartStory(item.sport)}>New {sportName(item.sport,'en').toLowerCase()} story</button>
    </article>)}</div>
    <p className="ed-desk-note">A source link is not a licence to copy its article or photos. Counts cover the loaded collection only. This queue does not claim sources were checked today; old stories cannot become new by changing publication dates.</p>
  </section>;
}
