/**
 * Production evidence: four tournament IDs in one /v4/odds-by-tournaments call succeed.
 * Twenty-two IDs in one call returned HTTP 400 and stale-quoted the working leagues.
 * Until OddsPapi documents a higher cap, never exceed this per request.
 */
export const MAX_TOURNAMENTS_PER_ODDSPAPI_REQUEST = 4;

/** Remaining-budget floor before starting a catalog or canary job. Not a used-discovery cap. */
export const COVERAGE_DISCOVERY_REQUEST_CAP = 20;

/**
 * Canary 4 continuation: extra MANUAL discovery calls after this watermark.
 * Previous 20-request milestone cap was a safety bound, not the provider limit.
 */
export const CANARY4_LEDGER_START = '2026-09-13T16:25:00.000Z';
export const CANARY4_DISCOVERY_REQUEST_CAP = 28;
