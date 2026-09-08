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
  season?: { id: number; name?: string };
  round?: { id: number; name?: string } | null;
  stage?: { id: number; name?: string } | null;
  group?: { id: number; name?: string } | null;
  venue?: { id: number; name?: string; city_name?: string } | null;
  events?: SportmonksEventPayload[];
  statistics?: SportmonksStatisticPayload[];
  lineups?: SportmonksLineupPayload[];
  formations?: Array<{ participant_id?: number; formation?: string }>;
  coaches?: Array<{ participant_id?: number; coach_id?: number; coach?: { id?: number; common_name?: string; display_name?: string; name?: string } }>;
}

export interface SportmonksEventPayload {
  id: number; type_id?: number; type?: { name?: string; developer_name?: string }; period_id?: number; detailed_period_id?: number;
  minute?: number; extra_minute?: number; participant_id?: number; player_id?: number; player_name?: string;
  related_player_id?: number; related_player_name?: string; result?: string; info?: string; addition?: string;
  sort_order?: number; rescinded?: boolean;
}
export interface SportmonksStatisticPayload {
  id: number; type_id?: number; type?: { name?: string; developer_name?: string }; participant_id?: number;
  location?: 'home' | 'away'; data?: { value?: number | string };
}
export interface SportmonksLineupPayload {
  id: number; team_id?: number; player_id?: number; player_name?: string; type_id?: number; position_id?: number;
  formation_field?: string | null; formation_position?: number | null; jersey_number?: number | null;
}
export interface SportmonksStandingPayload {
  id: number; league_id: number; season_id: number; stage_id?: number; group_id?: number | null; participant_id: number; position: number;
  points?: number; stage?: { id?: number; name?: string }; group?: { id?: number; name?: string } | null;
  details?: Array<{ type_id?: number; type?: { name?: string; developer_name?: string }; value?: number | string }>;
}

export interface SportmonksCountryPayload { id?: number; iso2?: string; name?: string; }
export interface SportmonksLeaguePayload {
  id: number; sport_id: number; country_id: number | null; name: string; country?: SportmonksCountryPayload;
  type?: string; sub_type?: string; category?: { id?: number; name?: string }; seasons?: SportmonksSeasonPayload[];
}
export interface SportmonksSeasonPayload { id: number; league_id: number; name: string; starting_at?: string; ending_at?: string; is_current?: boolean; }
export interface SportmonksTeamPayload { id: number; sport_id: number; country_id: number | null; name: string; short_code?: string; image_path?: string; country?: SportmonksCountryPayload; }

export interface SportmonksGateway {
  competitions(countryCodes?: readonly string[]): Promise<SportmonksLeaguePayload[]>;
  searchCompetitions(query: string): Promise<SportmonksLeaguePayload[]>;
  seasons(providerCompetitionId: string): Promise<SportmonksSeasonPayload[]>;
  teams(providerSeasonId: string): Promise<SportmonksTeamPayload[]>;
  fixtures(from: Date, to: Date, providerCompetitionIds?: readonly string[]): Promise<SportmonksFixturePayload[]>;
  fixture(providerFixtureId: string): Promise<SportmonksFixturePayload | null>;
  fixtureDetails(providerFixtureId: string): Promise<SportmonksFixturePayload | null>;
  scores(providerFixtureIds: readonly string[]): Promise<SportmonksFixturePayload[]>;
  events(providerFixtureId: string): Promise<unknown[]>;
  standings(providerSeasonId: string): Promise<SportmonksStandingPayload[]>;
  lineups(providerFixtureId: string): Promise<unknown[]>;
  statistics(providerFixtureId: string): Promise<unknown[]>;
  headToHead(providerHomeTeamId: string, providerAwayTeamId: string): Promise<SportmonksFixturePayload[]>;
  requestCount(): number;
}
