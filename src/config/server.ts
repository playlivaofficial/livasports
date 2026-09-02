import 'server-only';

export interface ServerEnvironment {
  sportmonksApiKey: string;
  oddsPapiApiKey: string;
  databaseUrl: string;
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
