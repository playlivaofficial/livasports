export interface OddsPapiMarketDefinition {
  marketId: number;
  marketName: string;
  playerProp: boolean;
  sportId: number;
  handicap: number | null;
  period: string;
  marketType: string;
  outcomes: Array<{ outcomeId: number; outcomeName: string }>;
}

export interface OddsPapiPrice {
  active: boolean;
  price: number;
  changedAt?: string;
  bookmakerChangedAt?: string | null;
  mainLine?: boolean;
}

export interface OddsPapiFixtureOdds {
  fixtureId: string;
  tournamentId: number;
  statusId: number;
  bookmakerOdds?: Record<string, {
    bookmakerIsActive?: boolean;
    suspended?: boolean;
    markets?: Record<string, { marketActive?: boolean; outcomes?: Record<string, { players?: Record<string, OddsPapiPrice> }> }>;
  }>;
}

export interface OddsPapiGateway {
  bookmakers(): Promise<Array<{ bookmakerName: string; slug: string; liveOdds: boolean | null }>>;
  markets(): Promise<OddsPapiMarketDefinition[]>;
  oddsByTournaments(tournamentIds: readonly string[], bookmaker: string): Promise<OddsPapiFixtureOdds[]>;
  requestCount(): number;
}
