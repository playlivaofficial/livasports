import {isMatchInSitemapWindow} from '@/seo/policy';
import {competitionDemand,type Geo} from '@/config/geo';
import {CLUB_FALLBACK,GLOBAL_CLUB_MAGNITUDE,LOCAL_CLUB_AFFINITY,MINIMUM_SCORE,ODDS_FULL_COVERAGE,PROXIMITY_CURVE,SCORE_WEIGHTS,SECOND_CLUB_SHARE,SHORTLIST,STAGE_PATTERNS,clubKey,rivalryFor,type ScoreComponent} from './config';

/**
 * Traffic Engine V1 — the priority engine.
 *
 * Pure and deterministic: the same signals and the same `now` always produce the same score and the
 * same explanation. There is no model, no randomness and no external call here, which is what makes
 * the ranking auditable by the owner and safe to re-run. Every component reports the evidence it used,
 * so "why did this rank first" is answered by data the fixture actually has.
 */

export interface TeamSignal {slug:string;name:string;publicId:string;imageUrl:string|null;country?:string|null;}
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
  commercialBookmakers?:number;
  pageUsable?:boolean;
}
export interface PriorityContext {geo:Geo;demandAdjustment?:number;intentStrength?:number;intentReason?:string;searchStrength?:number;commercialStrength?:number;}
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

export function competitionStrength(slug:string,geo:Geo='ROW'){return competitionDemand(geo,slug)/30;}
/** Editorial global magnitude is separate from local affinity (canonical country data). */
export function clubStrength(slug:string){return GLOBAL_CLUB_MAGNITUDE[clubKey(slug)]??CLUB_FALLBACK;}

/** Knockout importance from the stored stage/round text. Unmatched text scores nothing rather than guessing. */
export function stageStrength(stageName:string|null,roundName:string|null):{strength:number;label:string|null}{
  const text=`${plain(stageName)} ${plain(roundName)}`.trim();
  if(!text)return {strength:0,label:null};
  for(const [pattern,strength,label] of STAGE_PATTERNS)if(pattern.test(text))return {strength,label};
  return {strength:0,label:null};
}

/** Title race / relegation fight, only where the season actually has a table. */
export function standingsStrength(standings:StandingsSignal|null):{strength:number;reason:string}{
  return {strength:0,reason:standings?'Posiciones disponibles; sin reglas verificadas para inferir título, clasificación o descenso':'Sin clasificación verificada'};
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
  if(signals.pageUsable===false)return {eligible:false,reason:'destination data is not usable'};
  if(signals.status!=='SCHEDULED')return {eligible:false,reason:`fixture is not pregame (${signals.status.toLowerCase()})`};
  const at=Date.parse(signals.kickoff);
  if(!Number.isFinite(at))return {eligible:false,reason:'kickoff is unreadable'};
  const hours=(at-now.getTime())/3_600_000;
  if(hours<=0)return {eligible:false,reason:'kickoff has already passed'};
  if(hours>SHORTLIST.horizonHours)return {eligible:false,reason:'kickoff is beyond the planning horizon'};
  return {eligible:true,reason:null};
}

export function scoreFixture(signals:FixtureSignals,now:Date=new Date(),context:PriorityContext={geo:'ROW'}):FixturePriority{
  const eligibility=fixtureEligibility(signals,now);
  const lines:ScoreLine[]=[];
  const add=(component:ScoreComponent,strength:number,reason:string)=>{
    const weight=SCORE_WEIGHTS[component],bounded=clamp01(strength);
    lines.push({component,weight,strength:bounded,points:round(weight*bounded),reason});
  };

  const seed=competitionStrength(signals.competitionSlug,context.geo),competition=clamp01(seed+Math.max(-.12,Math.min(.12,context.demandAdjustment??0)));
  add('competition',competition,`${signals.competitionName}: demanda ${context.geo}, base ${seed.toFixed(2)}, ajuste ${(competition-seed).toFixed(2)}`);

  const local=(team:TeamSignal)=>team.country===context.geo&&['MX','CO','PE'].includes(context.geo) ? LOCAL_CLUB_AFFINITY : 0;
  const homeClub=Math.max(clubStrength(signals.home.slug),local(signals.home)),awayClub=Math.max(clubStrength(signals.away.slug),local(signals.away));
  const [top,second]=homeClub>=awayClub?[homeClub,awayClub]:[awayClub,homeClub];
  const topName=homeClub>=awayClub?signals.home.name:signals.away.name;
  add('clubs',top+second*SECOND_CLUB_SHARE,local(signals.home)||local(signals.away)?`Participación local ${context.geo}: ${[signals.home,signals.away].filter(t=>local(t)>0).map(t=>t.name).join(', ')} (país canónico del club)`:`Magnitud editorial de clubes: ${topName}; sin tendencia inventada`);

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
  add('intent',context.intentStrength??0,context.intentReason??'Sin muestra suficiente de intención de apuesta por GEO');
  add('search',context.searchStrength??0,'Evidencia GSC de esta URL canónica/locale; no equivale al país del visitante');
  add('commercial',context.commercialStrength??(signals.commercialBookmakers??0)/2,'Cobertura comercial aprobada y activa; nunca se supone una aprobación');

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
