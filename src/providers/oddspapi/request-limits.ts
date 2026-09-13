/**
 * Production evidence: four tournament IDs in one /v4/odds-by-tournaments call succeed.
 * Twenty-two IDs in one call returned HTTP 400 and stale-quoted the working leagues.
 * Until OddsPapi documents a higher cap, never exceed this per request.
 */
export const MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST = 4;

/** Shared discovery + scheduler accounting. Includes the catalog probe and per-league canaries. */
export const COVERAGE_DISCOVERY_REQUEST_CAP = 20;
