import Link from './SportsLink';
import {interfaceDictionary,matchPath,type InterfaceLocale} from '@/localization/interface';
import {TeamMark} from '@/components/sports/TeamMark';
import type {SportsFixture} from './types';
import {competitionPath,sportStage} from './policy';
import {sportsCopy} from './copy';
import {RedCardCount} from './RedCardCount';
import type {FixtureView} from '@/delivery/types';
import type {SiteLocale} from '@/config/i18n';
import {OddsComparison} from '@/components/sports/OddsComparison';
import {LiveOddsSlot} from '@/components/sports/LiveOddsSlot';
import {FavoriteButton} from '@/favorites/FavoriteButton';

export type MatchRowsProps={rows:SportsFixture[];locale:InterfaceLocale;empty:string;showCompetition?:boolean;oddsViews?:Record<string,FixtureView>;commercialLocale?:SiteLocale};

/** Public markup: time zone is supplied, never read from request cookies. */
export function MatchRowsView({rows,locale,empty,showCompetition=false,oddsViews,commercialLocale='br',timeZone}:MatchRowsProps&{timeZone:string}){
  const text=sportsCopy[locale],dictionary=interfaceDictionary(locale);
  const date=new Intl.DateTimeFormat(dictionary.locale,{day:'numeric',month:'short',year:'numeric',timeZone});
  const time=new Intl.DateTimeFormat(dictionary.locale,{hour:'2-digit',minute:'2-digit',timeZone});
  if(!rows.length)return <p className="sports-empty" role="status">{empty}</p>;
  const now=new Date().getTime();
  const groupKey=(row:SportsFixture)=>`${date.format(new Date(row.kickoff))}:${row.round??''}:${row.stage??''}:${showCompetition?row.competitionSlug:''}`;
  return <div className="sports-match-list">{rows.map((row,index)=>{
    const day=date.format(new Date(row.kickoff)),round=sportStage(locale,row.round),stage=sportStage(locale,row.stage);
    const heading=index===0||groupKey(rows[index-1])!==groupKey(row);
    const live=row.status==='LIVE'||row.status==='HALFTIME';
    const pending=row.status==='SCHEDULED'&&Date.parse(row.kickoff)<=now;
    return <div key={row.id}>{heading?<h3 className="sports-round">{showCompetition?<Link prefetch={false} href={competitionPath(locale,row.competitionSlug,{season:row.seasonId??undefined})}>{row.competition}</Link>:null}{day}{round?` · ${/^\d+$/.test(round)?text.round+' ':''}${round}`:stage?` · ${stage}`:''}</h3>:null}
      <div className="sports-match-row-wrap">
      <Link prefetch={false} className={`sports-match-row ${live?'is-live':''}`} href={matchPath(locale,row.publicId,row.home.name,row.away.name)} data-status={row.status}>
        <span className="sports-match-time"><time dateTime={row.kickoff}>{time.format(new Date(row.kickoff))}</time>{row.status!=='SCHEDULED'||pending?<small>{pending?text.pending:dictionary.statuses[row.status]}</small>:null}</span>
        <span className="sports-match-teams">{[row.home,row.away].map((t,i)=><span key={t.id}><TeamMark initials={t.name.slice(0,2)} imageUrl={t.imageUrl}/><span>{t.name}</span><RedCardCount locale={locale} count={i===0?row.homeRedCards:row.awayRedCards}/></span>)}</span>
        <span className="sports-match-score"><b>{row.status==='SCHEDULED'?'—':row.homeScore??'—'}</b><b>{row.status==='SCHEDULED'?'—':row.awayScore??'—'}</b></span>
      </Link>
      <FavoriteButton locale={locale} kind="fixture" id={row.publicId}/>
      </div>
      {oddsViews?<div className="sports-match-odds">{live||pending?<LiveOddsSlot locale={locale} live/>:row.status==='SCHEDULED'&&oddsViews[row.id]?<OddsComparison locale={locale} commercialLocale={commercialLocale} fixture={oddsViews[row.id]}/>:null}</div>:null}</div>;
  })}</div>;
}
