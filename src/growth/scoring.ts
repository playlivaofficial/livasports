import {isMatchInSitemapWindow} from '@/seo/policy';
import {CLUB_FALLBACK,CLUB_TIERS,COMPETITION_FALLBACK,COMPETITION_TRAFFIC_TIERS,MINIMUM_SCORE,ODDS_FULL_COVERAGE,PROXIMITY_CURVE,SCORE_WEIGHTS,SECOND_CLUB_SHARE,SHORTLIST,STAGE_PATTERNS,STANDINGS_RULES,clubKey,rivalryFor,type ScoreComponent} from './config';

/**
 * Traffic Engine V1 — the priority engine.
 *
 * Pure and deterministic: the same signals and the same `now` always produce the same score and the
 * same explanation. There is no model, no randomness and no external call here, which is what makes
 * the ranking auditable by the owner and safe to re-run. Every component reports the evidence it used,
 * so "why did this rank first" is answered by data the fixture actually has.
 */

export interface TeamSignal {slug:string;name:string;publicId:string;imageUrl:string|null;}
export interface StandingsSignal {homePosition:number|null;awayPosition:number|null;totalTeams:number|null;}
export interface FixtureSignals {
  fixtureId:string;publicId:string;kickoff:string;status:string;
  competitionSlug:string;competitionName:string;seasonName:string|null;
  competitionType:string;
  home:TeamSignal;away:TeamSignal;
  stageName:string|null;roundName:string|null;venue:string|null;
  standings:StandingsSignal|null;
  /** Distinct bookmakers currently priced for this fixture. */
  oddsBookmakers:number;
}
export interface ScoreLine {component:ScoreComponent;weight:number;strength:number;points:number;reason:string;}
export interface FixturePriority {
  fixtureId:string;publicId:string;kickoff:string;competitionSlug:string;
  total:number;lines:ScoreLine[];reasons:string[];
  rivalry:string|null;stage:string|null;
  eligible:boolean;ineligibleReason:string|null;
  oddsBookmakers:number;
}

const clamp01=(value:number)=>value<0?0:value>1?1:value;
const round=(value:number)=>Math.round(value*10)/10;
/** Accent- and case-insensitive text used for stage matching; the provider's casing varies. */
const plain=(value:string|null)=>(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'');

export function competitionStrength(slug:string){return COMPETITION_TRAFFIC_TIERS[slug]??COMPETITION_FALLBACK;}
export function clubStrength(slug:string){return CLUB_TIERS[clubKey(slug)]??CLUB_FALLBACK;}

/** Knockout importance from the stored stage/round text. Unmatched text scores nothing rather than guessing. */
export function stageStrength(stageName:string|null,roundName:string|null):{strength:number;label:string|null}{
  const text=`${plain(stageName)} ${plain(roundName)}`.trim();
  if(!text)return {strength:0,label:null};
  for(const [pattern,strength,label] of STAGE_PATTERNS)if(pattern.test(text))return {strength,label};
  return {strength:0,label:null};
}

/** Title race / relegation fight, only where the season actually has a table. */
export function standingsStrength(standings:StandingsSignal|null):{strength:number;reason:string}{
  if(!standings||standings.totalTeams===null||standings.totalTeams<=0)return {strength:0,reason:'no table for this season'};
  const {homePosition:home,awayPosition:away,totalTeams:total}=standings;
  const inTitle=(p:number|null)=>p!==null&&p<=STANDINGS_RULES.titlePositions;
  const inDrop=(p:number|null)=>p!==null&&p>total-STANDINGS_RULES.relegationPositions;
  const titles=[home,away].filter(inTitle).length,drops=[home,away].filter(inDrop).length;
  if(titles){
    const strength=clamp01(STANDINGS_RULES.titleStrength+(titles>1?STANDINGS_RULES.bothTeamsBonus:0));
    return {strength,reason:titles>1?'both teams in the title race':'a title contender is playing'};
  }
  if(drops){
    const strength=clamp01(STANDINGS_RULES.relegationStrength+(drops>1?STANDINGS_RULES.bothTeamsBonus:0));
    return {strength,reason:drops>1?'a direct relegation six-pointer':'a relegation-threatened team is playing'};
  }
  return {strength:0,reason:'mid-table for both teams'};
}

/** Hours until kickoff mapped through the configured curve; a match already in play stays at full strength. */
export function proximityStrength(kickoff:string,now:Date):{strength:number;hours:number}{
  const at=Date.parse(kickoff);
  if(!Number.isFinite(at))return {strength:0,hours:Number.NaN};
  const hours=(at-now.getTime())/3_600_000;
  if(hours<=0)return {strength:hours>=-SHORTLIST.graceHours?1:0,hours};
  for(const [limit,strength] of PROXIMITY_CURVE)if(hours<=limit)return {strength,hours};
  return {strength:0,hours};
}

/** How complete the landing page's own data is — a thin match page converts poorly. */
export function dataStrength(signals:FixtureSignals){
  const facts=[!!signals.home.imageUrl,!!signals.away.imageUrl,!!signals.seasonName,!!signals.venue,
    !!(signals.stageName??signals.roundName),!!signals.standings];
  return facts.filter(Boolean).length/facts.length;
}

/** Whether the fixture can carry traffic at all. Terminal and moved fixtures are never produced. */
export function fixtureEligibility(signals:FixtureSignals,now:Date):{eligible:boolean;reason:string|null}{
  if(['FINISHED','CANCELLED','ABANDONED'].includes(signals.status))return {eligible:false,reason:`fixture is ${signals.status.toLowerCase()}`};
  if(signals.status==='POSTPONED')return {eligible:false,reason:'fixture is postponed, so its kickoff is not trustworthy'};
  const at=Date.parse(signals.kickoff);
  if(!Number.isFinite(at))return {eligible:false,reason:'kickoff is unreadable'};
  const hours=(at-now.getTime())/3_600_000;
  if(hours<-SHORTLIST.graceHours)return {eligible:false,reason:'kickoff has already passed'};
  if(hours>SHORTLIST.horizonHours)return {eligible:false,reason:'kickoff is beyond the planning horizon'};
  return {eligible:true,reason:null};
}

export function scoreFixture(signals:FixtureSignals,now:Date=new Date()):FixturePriority{
  const eligibility=fixtureEligibility(signals,now);
  const lines:ScoreLine[]=[];
  const add=(component:ScoreComponent,strength:number,reason:string)=>{
    const weight=SCORE_WEIGHTS[component],bounded=clamp01(strength);
    lines.push({component,weight,strength:bounded,points:round(weight*bounded),reason});
  };

  const competition=competitionStrength(signals.competitionSlug);
  add('competition',competition,`${signals.competitionName} is tier ${competition.toFixed(2)} for Brazil traffic`);

  const homeClub=clubStrength(signals.home.slug),awayClub=clubStrength(signals.away.slug);
  const [top,second]=homeClub>=awayClub?[homeClub,awayClub]:[awayClub,homeClub];
  const topName=homeClub>=awayClub?signals.home.name:signals.away.name;
  add('clubs',top+second*SECOND_CLUB_SHARE,second>=0.5?`${signals.home.name} and ${signals.away.name} both draw a national audience`:`${topName} is the draw`);

  const rivalry=rivalryFor(signals.home.slug,signals.away.slug);
  add('rivalry',rivalry?rivalry.strength:0,rivalry?`${rivalry.name} — an established derby`:'not a derby fixture');

  const stage=stageStrength(signals.stageName,signals.roundName);
  add('stage',stage.strength,stage.label?`${stage.label} tie`:'no knockout stage recorded');

  const standings=standingsStrength(signals.competitionType==='DOMESTIC_LEAGUE'?signals.standings:null);
  add('standings',standings.strength,standings.reason);

  const proximity=proximityStrength(signals.kickoff,now);
  add('proximity',proximity.strength,Number.isFinite(proximity.hours)
    ?proximity.hours<=0?'in play now':`kicks off in ${Math.round(proximity.hours)}h`
    :'kickoff is unreadable');

  const oddsStrength=signals.oddsBookmakers/ODDS_FULL_COVERAGE;
  add('odds',oddsStrength,signals.oddsBookmakers?`${signals.oddsBookmakers} bookmaker${signals.oddsBookmakers>1?'s':''} priced`:'no bookmaker prices yet');

  add('data',dataStrength(signals),'completeness of the match page data');

  const inIndex=isMatchInSitemapWindow(signals.kickoff,now);
  const destination=(signals.oddsBookmakers>0?0.6:0)+(inIndex?0.4:0);
  add('destination',destination,signals.oddsBookmakers>0&&inIndex?'match page is indexable and carries odds'
    :inIndex?'match page is indexable but has no odds to compare':'match page cannot do its commercial job yet');

  const total=eligibility.eligible?round(lines.reduce((sum,line)=>sum+line.points,0)):0;
  const reasons=lines.filter(line=>line.points>0).sort((a,b)=>b.points-a.points||a.component.localeCompare(b.component))
    .slice(0,4).map(line=>line.reason);
  return {
    fixtureId:signals.fixtureId,publicId:signals.publicId,kickoff:signals.kickoff,competitionSlug:signals.competitionSlug,
    total,lines,reasons,rivalry:rivalry?.name??null,stage:stage.label,
    eligible:eligibility.eligible,ineligibleReason:eligibility.reason,oddsBookmakers:signals.oddsBookmakers,
  };
}

/** A fixture worth producing: eligible and above the configured floor. */
export const isProducible=(priority:FixturePriority)=>priority.eligible&&priority.total>=MINIMUM_SCORE;
