import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';

let client:PostgresDatabaseClient|null=null;

export function authDatabase():PostgresDatabaseClient {
  if(client)return client;
  const url=databaseUrl();
  if(!url)throw new Error('AUTH_DATABASE_UNAVAILABLE');
  client=new PostgresDatabaseClient(url);
  return client;
}

export function authConfigured():boolean {
  const secret=process.env.AUTH_SECRET?.trim();
  return !!secret&&secret.length>=32&&!!databaseUrl();
}

export function googleAuthConfigured():boolean {
  return !!(process.env.AUTH_GOOGLE_ID?.trim()&&process.env.AUTH_GOOGLE_SECRET?.trim());
}

export function emailAuthConfigured():boolean {
  return !!(process.env.AUTH_SMTP_HOST?.trim()&&process.env.AUTH_SMTP_USER?.trim()&&process.env.AUTH_SMTP_PASSWORD?.trim()&&process.env.AUTH_EMAIL_FROM?.trim());
}
