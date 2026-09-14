import Link from './SportsLink';
import {teamPath,type InterfaceLocale} from '@/localization/interface';
import type {TeamProfileView} from '@/profiles/types';
import {loadTeamHistory} from './runtime';
import {sportsCopy} from './copy';
import {sportsPage,sportsSeason,competitionPath} from './policy';
import {MatchRows} from './MatchRows';
export async function TeamHistoryPanel({profile,locale,query}:{profile:TeamProfileView;locale:InterfaceLocale;query:Record<string,string|string[]|undefined>}){
  const t=sportsCopy[locale],view=query.matches==='fixtures'?'fixtures':'results',page=sportsPage(query.p),requested=sportsSeason(query.season);
  const season=profile.competitions.some(s=>s.seasonId===requested)?requested:undefined;
  const requestedSquad=sportsSeason(query.squadSeason),squadSeason=profile.squad.data.some(s=>s.seasonId===requestedSquad)?requestedSquad:undefined;
  const path=teamPath(locale,profile.publicId,profile.name);
  const href=(v:string,p=1)=>{const q=new URLSearchParams({matches:v});if(season)q.set('season',season);if(squadSeason)q.set('squadSeason',squadSeason);if(p>1)q.set('p',String(p));return path+'?'+q+'#matches';};
  let history:Awaited<ReturnType<typeof loadTeamHistory>>={rows:[],hasNext:false};let failed=false;
  try{history=await loadTeamHistory(profile.publicId,locale,view,page,season);}catch{failed=true;}
  return <section id="matches" className="profile-panel sports-profile-history"><h2>{t.history}</h2>
    <nav className="sports-section-tabs" aria-label={t.history}>{(['fixtures','results'] as const).map(v=><Link prefetch={false} key={v} href={href(v)} aria-current={view===v?'page':undefined}>{t[v]}</Link>)}</nav>
    <form className="sports-season" action={path+'#matches'}><input type="hidden" name="matches" value={view}/>{squadSeason?<input type="hidden" name="squadSeason" value={squadSeason}/>:null}<label htmlFor="team-history-season">{t.season}</label><select name="season" id="team-history-season" defaultValue={season??''}><option value="">{t.allSeasons}</option>{profile.competitions.map(c=><option key={c.seasonId} value={c.seasonId}>{c.competition} · {c.season}</option>)}</select><button type="submit">{t.apply}</button></form>
    {failed?<p className="sports-empty">{t.unavailable}</p>:<MatchRows locale={locale} rows={history.rows} showCompetition empty={view==='results'?t.noResults:t.noFixtures}/>}
    <nav className="sports-pagination" aria-label={t.page}>{page>1?<Link prefetch={false} href={href(view,page-1)}>← {t.previous}</Link>:<span/>}<span>{t.page} {page}</span>{history.hasNext?<Link prefetch={false} href={href(view,page+1)}>{t.next} →</Link>:<span/>}</nav>
    <div className="sports-profile-contexts">{profile.competitions.filter(c=>c.isCurrent).map(c=><Link prefetch={false} key={c.seasonId} href={competitionPath(locale,c.competitionSlug,{season:c.seasonId,tab:'standings'})}>{c.competition} · {t.standings}</Link>)}</div>
  </section>;
}
