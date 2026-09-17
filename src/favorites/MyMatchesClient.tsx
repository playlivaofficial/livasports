'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {TeamMark} from '@/components/sports/TeamMark';
import {authPath} from '@/localization/auth-copy';
import {favoritesCopy,favoritesPath} from '@/localization/favorites-copy';
import {interfaceDictionary,interfaceRoutes,matchPath,type InterfaceLocale} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import {filterMyMatches,type MyMatchFilter,type MyMatchRow} from './feed';
import {FavoriteButton} from './FavoriteButton';
import {useFavoritesState} from './store';

function reasonLabel(locale:InterfaceLocale,reason:MyMatchRow['reason']){
  const text=favoritesCopy[locale];
  return reason==='team'?text.reasonTeam:reason==='competition'?text.reasonCompetition:text.reasonMatch;
}

export function MyMatchesClient({locale,authenticated,initial}:{locale:InterfaceLocale;authenticated:boolean;initial:MyMatchRow[]|null}){
  const text=favoritesCopy[locale];
  const dictionary=interfaceDictionary(locale);
  const favorites=useFavoritesState();
  const [view,setView]=useState<MyMatchFilter>('all');
  const [guestRows,setGuestRows]=useState<MyMatchRow[]|null>(null);
  const guestHasItems=favorites.teams.size+favorites.competitions.size+favorites.fixtures.size>0;
  useEffect(()=>{
    if(authenticated||!favorites.ready||!guestHasItems)return;
    const guest={version:1 as const,teams:[...favorites.teams],competitions:[...favorites.competitions],fixtures:[...favorites.fixtures]};
    let cancelled=false;
    fetch('/api/favorites/feed',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({locale,...guest})})
      .then(response=>response.ok?response.json():null)
      .then(body=>{if(!cancelled)setGuestRows(Array.isArray(body?.rows)?body.rows:[]);})
      .catch(()=>{if(!cancelled)setGuestRows([]);});
    return()=>{cancelled=true;};
  },[authenticated,favorites.ready,guestHasItems,locale,favorites.teams,favorites.competitions,favorites.fixtures]);
  const rows=useMemo(()=>authenticated?initial??[]:guestRows??[],[authenticated,initial,guestRows]);
  const loading=!authenticated&&(!favorites.ready||(guestHasItems&&guestRows===null));
  const visible=useMemo(()=>filterMyMatches(rows,view),[rows,view]);
  const time=useMemo(()=>new Intl.DateTimeFormat(dictionary.locale,{hour:'2-digit',minute:'2-digit'}),[dictionary.locale]);
  const date=useMemo(()=>new Intl.DateTimeFormat(dictionary.locale,{day:'numeric',month:'short'}),[dictionary.locale]);
  const empty=!loading&&!rows.length;
  return <div className="my-matches">
    <nav className="my-matches-filters" aria-label={text.title}>
      {(['all','live','upcoming','results'] as const).map(key=><button key={key} type="button" aria-pressed={view===key} onClick={()=>setView(key)}>{text[key]}</button>)}
    </nav>
    {!authenticated?<p className="my-matches-sync"><Link href={`${authPath(locale,'signin')}?callbackUrl=${encodeURIComponent(favoritesPath(locale))}`}>{text.signInSync}</Link></p>:null}
    {loading?<p className="sports-empty" role="status">{text.loading}</p>:null}
    {empty?<div className="my-matches-empty" role="status"><h2>{text.emptyTitle}</h2><p>{text.empty}</p><Link href={interfaceRoutes[locale].football}>{text.emptyCta}</Link></div>:null}
    {!loading&&visible.length?<div className="sports-match-list">{visible.map(row=>{
      const fixture=row.fixture,live=fixture.status==='LIVE'||fixture.status==='HALFTIME';
      return <div key={fixture.id} className="sports-match-row-wrap">
        <p className="favorite-reason"><Link href={competitionPath(locale,fixture.competitionSlug,{season:fixture.seasonId??undefined})}>{fixture.competition}</Link> · {reasonLabel(locale,row.reason)} · {date.format(new Date(fixture.kickoff))}</p>
        <Link prefetch={false} className={`sports-match-row ${live?'is-live':''}`} href={matchPath(locale,fixture.publicId,fixture.home.name,fixture.away.name)} data-status={fixture.status}>
          <span className="sports-match-time"><time dateTime={fixture.kickoff}>{time.format(new Date(fixture.kickoff))}</time><small>{dictionary.statuses[fixture.status]}</small></span>
          <span className="sports-match-teams">{[fixture.home,fixture.away].map(team=><span key={team.id}><TeamMark initials={team.name.slice(0,2)} imageUrl={team.imageUrl}/><span>{team.name}</span></span>)}</span>
          <span className="sports-match-score"><b>{fixture.status==='SCHEDULED'?'—':fixture.homeScore??'—'}</b><b>{fixture.status==='SCHEDULED'?'—':fixture.awayScore??'—'}</b></span>
        </Link>
        <FavoriteButton locale={locale} kind="fixture" id={fixture.publicId}/>
      </div>;
    })}</div>:!loading&&rows.length?<p className="sports-empty" role="status">{text.empty}</p>:null}
  </div>;
}
