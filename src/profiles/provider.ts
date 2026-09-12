import { SafeProviderError, sanitizeQuery, sanitizeText } from '@/providers/safe-error';

export interface ProviderStatisticDetail {
  id?: number;
  type_id?: number;
  type?: { id?: number; name?: string; developer_name?: string; model_type?: string; stat_group?: string | null };
  value?: Record<string, unknown>;
  data?: Record<string, unknown>;
}
export interface ProviderSeasonStatistic {
  id?: number;
  team_id?: number;
  player_id?: number;
  season_id?: number;
  position_id?: number;
  jersey_number?: number;
  details?: ProviderStatisticDetail[];
}
export interface ProviderPlayer {
  id: number;
  sport_id?: number;
  country_id?: number | null;
  nationality_id?: number | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  common_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  name?: string | null;
  display_name?: string | null;
  image_path?: string | null;
  height?: number | null;
  weight?: number | null;
  date_of_birth?: string | null;
  gender?: string | null;
  country?: { name?: string } | null;
  nationality?: { name?: string } | null;
  position?: { id?: number; name?: string } | null;
  detailedPosition?: { id?: number; name?: string } | null;
  statistics?: ProviderSeasonStatistic[];
}
export interface ProviderSquadRow {
  id: number;
  player_id: number;
  team_id: number;
  season_id?: number;
  position_id?: number | null;
  detailed_position_id?: number | null;
  jersey_number?: number | null;
  start?: string | null;
  end?: string | null;
  player?: ProviderPlayer;
  position?: { id?: number; name?: string } | null;
  details?: ProviderStatisticDetail[];
}
export interface ProviderTeamProfile {
  id: number;
  name: string;
  short_code?: string | null;
  image_path?: string | null;
  founded?: number | null;
  country?: { name?: string } | null;
  venue?: { name?: string; city_name?: string; city?: { name?: string } } | null;
  coaches?: Array<{ active?: boolean; start?: string | null; end?: string | null; common_name?: string; display_name?: string; name?: string;
    coach?: { common_name?: string; display_name?: string; name?: string } }>;
  statistics?: ProviderSeasonStatistic[];
}

export interface ProfileDataProvider {
  team(providerTeamId: string, providerSeasonId: string): Promise<ProviderTeamProfile | null>;
  squad(providerTeamId: string, providerSeasonId: string): Promise<ProviderSquadRow[]>;
  player(providerPlayerId: string, providerSeasonId: string): Promise<ProviderPlayer | null>;
  fixturePlayerStatistics(providerFixtureId: string): Promise<ProviderSquadRow[]>;
  requestCount(): number;
}

interface Envelope<T> { data?: T; code?: string | number; message?: string; error?: string; }

export class SportmonksProfileAdapter implements ProfileDataProvider {
  private requests = 0;
  constructor(private readonly apiKey: string, private readonly requestBudget = 50,
    private readonly baseUrl = 'https://api.sportmonks.com/v3') {
    if (!apiKey) throw new Error('SPORTMONKS_API_KEY is required on the server');
  }

  private async request<T>(path: string, query: Record<string, string>): Promise<T | null> {
    if (this.requests >= this.requestBudget) throw new Error(`Sportmonks profile request budget ${this.requestBudget} exceeded`);
    const url = new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
    this.requests++;
    const response = await fetch(url, { headers: { Authorization: this.apiKey, Accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as Envelope<T>;
    if (response.status === 404 && (body.code === 5000 || /not found/i.test(body.message ?? ''))) return null;
    if (!response.ok) throw new SafeProviderError({ provider: 'SPORTMONKS', status: response.status,
      endpoint: url.pathname, query: sanitizeQuery(url.searchParams), code: body.code ? String(body.code) : null,
      message: sanitizeText(body.message ?? body.error ?? 'Provider request failed', [this.apiKey]) });
    return body.data ?? null;
  }

  team(providerTeamId: string, providerSeasonId: string) {
    return this.request<ProviderTeamProfile>(`football/teams/${providerTeamId}`, {
      include: 'country;venue;coaches;statistics.details.type',
      filters: `teamStatisticSeasons:${providerSeasonId}`,
    });
  }
  async squad(providerTeamId: string, providerSeasonId: string) {
    return await this.request<ProviderSquadRow[]>(`football/squads/seasons/${providerSeasonId}/teams/${providerTeamId}`, {
      include: 'player;position',
    }) ?? [];
  }
  player(providerPlayerId: string, providerSeasonId: string) {
    return this.request<ProviderPlayer>(`football/players/${providerPlayerId}`, {
      include: 'country;nationality;position;detailedPosition;metadata;teams.team;statistics.details.type',
      filters: `playerStatisticSeasons:${providerSeasonId}`,
    });
  }
  async fixturePlayerStatistics(providerFixtureId: string) {
    const fixture = await this.request<{ lineups?: ProviderSquadRow[] }>(`football/fixtures/${providerFixtureId}`, {
      include: 'lineups.details.type', filters: 'lineupDetailTypes:42,52,57,79,80,83,84,86,118,119',
    });
    return fixture?.lineups ?? [];
  }
  requestCount() { return this.requests; }
}
