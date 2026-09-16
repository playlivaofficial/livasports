import 'server-only';
import {createHash} from 'node:crypto';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {DISPLAY_NAME_MAX,normalizeEmail} from './identity';

export interface AuthUserRow {
  id:string;
  email:string;
  emailNormalized:string;
  emailVerified:Date|null;
  name:string|null;
  image:string|null;
}

export interface AuthAccountRow {
  userId:string;
  type:string;
  provider:string;
  providerAccountId:string;
  refresh_token?:string|null;
  access_token?:string|null;
  expires_at?:number|null;
  token_type?:string|null;
  scope?:string|null;
  id_token?:string|null;
  session_state?:string|null;
}

function hashToken(token:string):string {
  return createHash('sha256').update(token).digest('hex');
}

function mapUser(row:{id:string;email:string;email_normalized:string;email_verified_at:Date|string|null;name:string|null;image:string|null}):AuthUserRow {
  return {id:row.id,email:row.email,emailNormalized:row.email_normalized,emailVerified:row.email_verified_at?new Date(row.email_verified_at):null,name:row.name,image:row.image};
}

export class AuthRepository {
  constructor(private readonly db:QueryExecutor){}

  async createUser(input:{email:string;name?:string|null;image?:string|null;emailVerified?:Date|null}):Promise<AuthUserRow> {
    const email=normalizeEmail(input.email);
    if(!email)throw new Error('INVALID_EMAIL');
    const result=await this.db.query<{id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      `INSERT INTO auth_users (email,email_normalized,email_verified_at,name,image)
       VALUES ($1,$1,$2,$3,$4)
       ON CONFLICT (email_normalized) DO NOTHING
       RETURNING id,email,email_normalized,email_verified_at,name,image`,
      [email,input.emailVerified??null,input.name??null,input.image??null]);
    if(result.rows[0])return mapUser(result.rows[0]);
    throw new Error('EMAIL_IN_USE');
  }

  async getUser(id:string):Promise<AuthUserRow|null> {
    const result=await this.db.query<{id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      'SELECT id,email,email_normalized,email_verified_at,name,image FROM auth_users WHERE id=$1',[id]);
    return result.rows[0]?mapUser(result.rows[0]):null;
  }

  async getUserByEmail(email:string):Promise<AuthUserRow|null> {
    const normalized=normalizeEmail(email);if(!normalized)return null;
    const result=await this.db.query<{id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      'SELECT id,email,email_normalized,email_verified_at,name,image FROM auth_users WHERE email_normalized=$1',[normalized]);
    return result.rows[0]?mapUser(result.rows[0]):null;
  }

  async getUserByAccount(provider:string,providerAccountId:string):Promise<AuthUserRow|null> {
    const result=await this.db.query<{id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      `SELECT u.id,u.email,u.email_normalized,u.email_verified_at,u.name,u.image
       FROM auth_accounts a JOIN auth_users u ON u.id=a.user_id
       WHERE a.provider=$1 AND a.provider_account_id=$2`,[provider,providerAccountId]);
    return result.rows[0]?mapUser(result.rows[0]):null;
  }

  async updateUser(input:{id:string;name?:string|null;image?:string|null;email?:string|null;emailVerified?:Date|null}):Promise<AuthUserRow> {
    const name=input.name===undefined?undefined:sanitizeName(input.name);
    const result=await this.db.query<{id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      `UPDATE auth_users SET
         name=COALESCE($2,name),
         image=COALESCE($3,image),
         email_verified_at=COALESCE($4,email_verified_at),
         updated_at=now()
       WHERE id=$1
       RETURNING id,email,email_normalized,email_verified_at,name,image`,
      [input.id,name??null,input.image??null,input.emailVerified??null]);
    if(!result.rows[0])throw new Error('USER_MISSING');
    return mapUser(result.rows[0]);
  }

  async linkAccount(account:AuthAccountRow):Promise<void> {
    await this.db.query(
      `INSERT INTO auth_accounts (user_id,type,provider,provider_account_id,refresh_token,access_token,expires_at,token_type,scope,id_token,session_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [account.userId,account.type,account.provider,account.providerAccountId,account.refresh_token??null,account.access_token??null,
        account.expires_at??null,account.token_type??null,account.scope??null,account.id_token??null,account.session_state??null]);
  }

  async unlinkAccount(provider:string,providerAccountId:string):Promise<void> {
    await this.db.query('DELETE FROM auth_accounts WHERE provider=$1 AND provider_account_id=$2',[provider,providerAccountId]);
  }

  async listAccountProviders(userId:string):Promise<string[]> {
    const result=await this.db.query<{provider:string}>('SELECT provider FROM auth_accounts WHERE user_id=$1 ORDER BY provider',[userId]);
    return result.rows.map(row=>row.provider);
  }

  async createSession(input:{sessionToken:string;userId:string;expires:Date}):Promise<{sessionToken:string;userId:string;expires:Date}> {
    const tokenHash=hashToken(input.sessionToken);
    await this.db.query(
      'INSERT INTO auth_sessions (user_id,session_token_hash,expires_at) VALUES ($1,$2,$3)',
      [input.userId,tokenHash,input.expires]);
    return {sessionToken:input.sessionToken,userId:input.userId,expires:input.expires};
  }

  async getSessionAndUser(sessionToken:string):Promise<{session:{sessionToken:string;userId:string;expires:Date};user:AuthUserRow}|null> {
    const tokenHash=hashToken(sessionToken);
    const result=await this.db.query<{session_id:string;expires_at:Date;id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null}>(
      `SELECT s.id AS session_id,s.expires_at,u.id,u.email,u.email_normalized,u.email_verified_at,u.name,u.image
       FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
       WHERE s.session_token_hash=$1`,[tokenHash]);
    const row=result.rows[0];if(!row)return null;
    if(new Date(row.expires_at).getTime()<=Date.now()){
      await this.db.query('DELETE FROM auth_sessions WHERE session_token_hash=$1',[tokenHash]);
      return null;
    }
    return {session:{sessionToken,userId:row.id,expires:new Date(row.expires_at)},user:mapUser(row)};
  }

  async updateSession(input:{sessionToken:string;expires?:Date}):Promise<{sessionToken:string;userId:string;expires:Date}|null> {
    const tokenHash=hashToken(input.sessionToken);
    const result=await this.db.query<{user_id:string;expires_at:Date}>(
      'UPDATE auth_sessions SET expires_at=COALESCE($2,expires_at) WHERE session_token_hash=$1 RETURNING user_id,expires_at',
      [tokenHash,input.expires??null]);
    if(!result.rows[0])return null;
    return {sessionToken:input.sessionToken,userId:result.rows[0].user_id,expires:new Date(result.rows[0].expires_at)};
  }

  async deleteSession(sessionToken:string):Promise<void> {
    await this.db.query('DELETE FROM auth_sessions WHERE session_token_hash=$1',[hashToken(sessionToken)]);
  }

  async createVerificationToken(input:{identifier:string;token:string;expires:Date}):Promise<{identifier:string;token:string;expires:Date}> {
    const identifier=normalizeEmail(input.identifier);if(!identifier)throw new Error('INVALID_EMAIL');
    const tokenHash=hashToken(input.token);
    await this.db.query('DELETE FROM auth_verification_tokens WHERE identifier_normalized=$1 AND expires_at <= now()',[identifier]);
    await this.db.query(
      `INSERT INTO auth_verification_tokens (identifier_normalized,token_hash,expires_at) VALUES ($1,$2,$3)
       ON CONFLICT (identifier_normalized,token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at`,
      [identifier,tokenHash,input.expires]);
    return {identifier,token:input.token,expires:input.expires};
  }

  async useVerificationToken(input:{identifier:string;token:string}):Promise<{identifier:string;token:string;expires:Date}|null> {
    const identifier=normalizeEmail(input.identifier);if(!identifier)return null;
    const tokenHash=hashToken(input.token);
    const result=await this.db.query<{expires_at:Date}>(
      `DELETE FROM auth_verification_tokens
       WHERE identifier_normalized=$1 AND token_hash=$2 AND expires_at > now()
       RETURNING expires_at`,
      [identifier,tokenHash]);
    if(!result.rows[0])return null;
    return {identifier,token:input.token,expires:new Date(result.rows[0].expires_at)};
  }
}

export function sanitizeName(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const name=value.replace(/[\u0000-\u001f\u007f]/g,'').trim();
  if(!name||name.length>DISPLAY_NAME_MAX)return null;
  return name;
}

export async function withAuthTransaction<T>(database:DatabaseClient,work:(repo:AuthRepository)=>Promise<T>):Promise<T> {
  return database.transaction(client=>work(new AuthRepository(client)));
}

export {hashToken};
