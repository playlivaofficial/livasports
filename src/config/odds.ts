export interface OddsRuntimeConfig {
  staleAfterSeconds: number;
  oddsPapiMonthlyRequestLimit: number;
  oddsPapiMinRefreshSeconds: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadOddsRuntimeConfig(env: NodeJS.ProcessEnv = process.env): OddsRuntimeConfig {
  return {
    staleAfterSeconds: positiveInteger(env.ODDS_STALE_AFTER_SECONDS, 300, 'ODDS_STALE_AFTER_SECONDS'),
    oddsPapiMonthlyRequestLimit: positiveInteger(env.ODDSPAPI_MONTHLY_REQUEST_LIMIT, 5000, 'ODDSPAPI_MONTHLY_REQUEST_LIMIT'),
    oddsPapiMinRefreshSeconds: positiveInteger(env.ODDSPAPI_MIN_REFRESH_SECONDS, 300, 'ODDSPAPI_MIN_REFRESH_SECONDS'),
  };
}
