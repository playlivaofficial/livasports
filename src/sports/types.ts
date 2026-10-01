import type {FixtureStatus} from '@/domain/enums';
export interface SportsTeam {id:string;publicId:string;name:string;imageUrl:string|null}
export interface SportsFixture {
  id:string;publicId:string;competition:string;competitionSlug:string;seasonId:string|null;
  kickoff:string;status:FixtureStatus;round:string|null;stage:string|null;
  home:SportsTeam;away:SportsTeam;homeScore:number|null;awayScore:number|null;
  homeRedCards?:number|null;awayRedCards?:number|null;
}
export interface SportsSeason {id:string;name:string;current:boolean;fixtures:number}
export interface SportsStanding {
  team:SportsTeam|null;sourceKey?:string;stage:string|null;group:string|null;position:number;played:number|null;won:number|null;drawn:number|null;lost:number|null;
  goalsFor:number|null;goalsAgainst:number|null;goalDifference:number|null;points:number|null;updatedAt:string|null;
  form:string[];rule:number|null;
  home:StandingSplit;away:StandingSplit;
}
export interface StandingSplit {played:number|null;won:number|null;drawn:number|null;lost:number|null;goalsFor:number|null;goalsAgainst:number|null;goalDifference:number|null;points:number|null}
export interface SportsScorer {publicId:string|null;sourceKey?:string;name:string;team:SportsTeam|null;nationality:string|null;countryCode:string|null;goals:number;assists:number|null;appearances:number|null;minutes:number|null;rank:number}
export interface PendingSportsFixture {publicId:string;kickoff:string|null;round:string|null;stage:string|null;competitionSlug:string;seasonId:string;season:string;home:string|null;away:string|null;}
export interface CompetitionHub {
  id:string;slug:string;name:string;country:string|null;countryCode:string|null;region:string;type:string;coverage:string;seasons:SportsSeason[];season:SportsSeason|null;
  seasonFallback:SportsSeason|null;
  /** Season resolved when no ?season is requested (P2 canonical policy). */
  defaultSeasonId:string|null;
  upcoming:SportsFixture[];results:SportsFixture[];standings:SportsStanding[];scorers:SportsScorer[];teams:SportsTeam[];
  standingsFreshness?:import('./standings-read').StandingsFreshness|null;
  counts:{upcoming:number;results:number};page:number;pageSize:number;providerRequests:0;
  availability:Record<string,{status:string;checkedAt:string|null}>;
  pending:PendingSportsFixture[];pendingTotal:number;
}
export interface SportsSearchResult {kind:'competition'|'team'|'player';publicId:string;name:string;context:string|null;slug:string|null;countryCode:string|null;countryName:string|null;region:string|null;imageUrl:string|null}
export interface CompetitionNavItem {slug:string;name:string;group:string;count:number;countryCode:string|null;countryName:string|null;region:string|null}
