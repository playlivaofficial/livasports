export interface SportmonksParticipant {
  id: number;
  name: string;
  meta?: { location?: 'home' | 'away' };
}

export interface SportmonksFixturePayload {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number | null;
  state_id: number;
  starting_at: string;
  participants?: SportmonksParticipant[];
  scores?: Array<{ description?: string; score?: { goals?: number }; participant_id?: number }>;
  state?: { name?: string; developer_name?: string };
  created_at?: string;
  updated_at?: string;
}

export interface SportmonksLeaguePayload { id: number; sport_id: number; country_id: number | null; name: string; country?: { iso2?: string; name?: string }; }
export interface SportmonksSeasonPayload { id: number; league_id: number; name: string; starting_at?: string; ending_at?: string; }
export interface SportmonksTeamPayload { id: number; sport_id: number; country_id: number | null; name: string; short_code?: string; }

export interface SportmonksGateway {
  competitions(countryCodes?: readonly string[]): Promise<SportmonksLeaguePayload[]>;
  seasons(providerCompetitionId: string): Promise<SportmonksSeasonPayload[]>;
  teams(providerSeasonId: string): Promise<SportmonksTeamPayload[]>;
  fixtures(from: Date, to: Date, providerCompetitionIds?: readonly string[]): Promise<SportmonksFixturePayload[]>;
  fixture(providerFixtureId: string): Promise<SportmonksFixturePayload | null>;
  scores(providerFixtureIds: readonly string[]): Promise<SportmonksFixturePayload[]>;
  events(providerFixtureId: string): Promise<unknown[]>;
  standings(providerSeasonId: string): Promise<unknown[]>;
  lineups(providerFixtureId: string): Promise<unknown[]>;
  statistics(providerFixtureId: string): Promise<unknown[]>;
  headToHead(providerHomeTeamId: string, providerAwayTeamId: string): Promise<SportmonksFixturePayload[]>;
}
