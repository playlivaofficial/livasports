export interface CacheTtlPolicy {
  competitions: number;
  teams: number;
  fixtures: number;
  scores: number;
  odds: number;
}

export const DEFAULT_CACHE_TTLS: CacheTtlPolicy = {
  competitions: 24 * 60 * 60,
  teams: 24 * 60 * 60,
  fixtures: 15 * 60,
  scores: 30,
  odds: 5 * 60,
};
