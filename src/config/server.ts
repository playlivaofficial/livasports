import 'server-only';

export interface ServerEnvironment {
  sportmonksApiKey: string;
  oddsPapiApiKey: string;
  databaseUrl: string;
}

export interface ProviderEnvironment {
  sportmonksApiKey: string | null;
  oddsPapiApiKey: string | null;
  sportmonksBaseUrl: string;
  oddsPapiBaseUrl: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the server environment`);
  return value;
}

export function loadServerEnvironment(env: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return {
    sportmonksApiKey: required(env, 'SPORTMONKS_API_KEY'),
    oddsPapiApiKey: required(env, 'ODDSPAPI_API_KEY'),
    databaseUrl: required(env, 'DATABASE_URL'),
  };
}


function optionalSecret(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  if (!value || /replace_with_real_token|your[_ -]?token/i.test(value)) return null;
  return value;
}

export function loadProviderEnvironment(env: NodeJS.ProcessEnv = process.env): ProviderEnvironment {
  return {
    sportmonksApiKey: optionalSecret(env, 'SPORTMONKS_API_KEY'),
    oddsPapiApiKey: optionalSecret(env, 'ODDSPAPI_API_KEY'),
    sportmonksBaseUrl: env.SPORTMONKS_BASE_URL?.trim() || 'https://api.sportmonks.com/v3',
    oddsPapiBaseUrl: env.ODDSPAPI_BASE_URL?.trim() || 'https://api.oddspapi.io/v4',
  };
}
