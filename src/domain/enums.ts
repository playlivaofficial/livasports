export enum ProviderCode {
  SPORTMONKS = 'SPORTMONKS',
  ODDSPAPI = 'ODDSPAPI',
}

export enum ProviderEntityType {
  SPORT = 'SPORT', COUNTRY = 'COUNTRY', COMPETITION = 'COMPETITION', SEASON = 'SEASON',
  TEAM = 'TEAM', FIXTURE = 'FIXTURE', BOOKMAKER = 'BOOKMAKER', MARKET = 'MARKET',
}

export enum FixtureStatus {
  SCHEDULED = 'SCHEDULED', LIVE = 'LIVE', HALFTIME = 'HALFTIME', FINISHED = 'FINISHED',
  POSTPONED = 'POSTPONED', CANCELLED = 'CANCELLED', ABANDONED = 'ABANDONED',
}

export enum MarketCode {
  MATCH_WINNER = 'MATCH_WINNER',
  TOTAL_GOALS = 'TOTAL_GOALS',
  BTTS = 'BTTS',
}

export enum OutcomeCode {
  HOME = 'HOME', DRAW = 'DRAW', AWAY = 'AWAY', OVER = 'OVER', UNDER = 'UNDER', YES = 'YES', NO = 'NO',
}

export enum OddsQuoteStatus {
  ACTIVE = 'ACTIVE', STALE = 'STALE', SUSPENDED = 'SUSPENDED', CLOSED = 'CLOSED',
}

export enum AffiliateStatus {
  ACTIVE = 'ACTIVE', PENDING = 'PENDING', INACTIVE = 'INACTIVE', NOT_APPLIED = 'NOT_APPLIED',
}

export const MARKET_OUTCOMES: Readonly<Record<MarketCode, readonly OutcomeCode[]>> = {
  [MarketCode.MATCH_WINNER]: [OutcomeCode.HOME, OutcomeCode.DRAW, OutcomeCode.AWAY],
  [MarketCode.TOTAL_GOALS]: [OutcomeCode.OVER, OutcomeCode.UNDER],
  [MarketCode.BTTS]: [OutcomeCode.YES, OutcomeCode.NO],
};
