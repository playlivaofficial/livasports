export interface CacheTtlPolicy {
  competitions: number;
  teams: number;
  fixtures: number;
  scores: number;
  odds: number;
  finishedFixtures: number;
  todayFixtures: number;
  liveFixtures: number;
  standings: number;
  routeHome: number;
  routeFootball: number;
  routeToday: number;
  routeLive: number;
}

export const DEFAULT_CACHE_TTLS: CacheTtlPolicy = {
  competitions: 24 * 60 * 60,
  teams: 24 * 60 * 60,
  fixtures: 15 * 60,
  scores: 30,
  odds: 5 * 60,
  finishedFixtures: 6 * 60 * 60,
  todayFixtures: 2 * 60,
  liveFixtures: 30,
  standings: 10 * 60,
  routeHome: 2 * 60,
  routeFootball: 5 * 60,
  routeToday: 2 * 60,
  routeLive: 30,
};
