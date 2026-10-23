import type {NewsRecord} from './model';
import {editorialSourcePolicy} from './sources';
import {newsroomCoverage} from './coverage';
import {sportName} from './copy';

export function NewsroomCoverage({records,now}:{records:NewsRecord[];now:Date}){
  const coverage=newsroomCoverage(records,now);
  return <section className="ed-coverage" aria-labelledby="coverage-heading"><h3 id="coverage-heading">Coverage & review queue</h3>
    <p><strong>{editorialSourcePolicy.sourceStatus}</strong> · Sources are not fetched or checked automatically. Human review applies only to the saved story revision. No automatic publication.</p>
    <p>Counts cover the loaded editorial collection (up to 200 records). Recent means the source date and recorded human review are both within seven days. Categories do not imply an active competition.</p>
    <div className="ed-coverage-scroll"><table><thead><tr><th scope="col">Sport</th><th scope="col">Needs review</th><th scope="col">Ready</th><th scope="col">Published</th><th scope="col">Recent</th><th scope="col">Last published</th><th scope="col">Latest source date</th><th scope="col">Coverage</th></tr></thead><tbody>{coverage.map(item=><tr key={item.sport}><th scope="row">{sportName(item.sport,'en')}</th><td>{item.reviewQueue}</td><td>{item.readyToPublish}</td><td>{item.published}</td><td>{item.recent}</td><td>{item.lastPublishedAt?<time dateTime={item.lastPublishedAt}>{item.lastPublishedAt.slice(0,10)}</time>:'None'}</td><td>{item.latestSourcePublishedOn??'None'}</td><td>{item.missingCoverage?'Missing coverage':item.staleCoverage?'No recent coverage':'Recent coverage'}</td></tr>)}</tbody></table></div>
  </section>;
}
