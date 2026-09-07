import type { Competition, Country, Sport, Team } from '@/domain/entities';
import type { SeasonId } from '@/domain/ids';
import type { FootballCompetitionTarget } from '@/config/footballCompetitions';
import type { CompetitionCoverageStatus } from '@/domain/enums';
import type { SportsDataProvider } from './SportsDataProvider';

export interface CompetitionCatalog {
  sport: Sport;
  countries: Country[];
  competitions: Array<{ targetKey: string; competition: Competition; target?: FootballCompetitionTarget;
    coverageStatus?: CompetitionCoverageStatus; providerName?: string }>;
}

export interface TeamCatalog { countries: Country[]; teams: Team[]; }

export interface FootballIngestionProvider extends SportsDataProvider {
  discoverCompetitions(targets: readonly FootballCompetitionTarget[]): Promise<CompetitionCatalog>;
  getTeamCatalog(seasonId: SeasonId): Promise<TeamCatalog>;
  getRequestCount(): number;
}
