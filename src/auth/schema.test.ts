import {readdirSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('db/migrations/022_p1_1_user_auth.sql','utf8');
const files=readdirSync('db/migrations').filter(file=>/^\d+_/.test(file)).sort();

describe('migration 022 user auth schema',()=>{
  it('is the additive successor of 021 and never edits earlier files',()=>{
    expect(files.at(-1)).toBe('025_p3_odds_reliability.sql');expect(files).toContain('024_p2_sitemap_player_indexes.sql');expect(files).toContain('023_p1_2_user_favorites.sql');
    expect(files).toContain('021_owner_qa_login_rate_limit.sql');
    expect(sql.startsWith('BEGIN;')).toBe(true);
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql).not.toContain('ALTER TABLE owner');
    expect(sql).not.toMatch(/CREATE TABLE (favorites|notifications|owner_qa_login_rate_limits)/);
  });

  it('creates isolated auth tables with uuid keys, normalized email uniqueness and cascade deletes',()=>{
    expect(sql).toMatch(/CREATE TABLE auth_users \([\s\S]*id uuid PRIMARY KEY/);
    expect(sql).toContain('CONSTRAINT auth_users_email_normalized_eq CHECK (email_normalized = lower(btrim(email)))');
    expect(sql).toContain('CONSTRAINT auth_users_email_normalized_unique UNIQUE (email_normalized)');
    expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()');
    expect(sql).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
    expect(sql).toMatch(/auth_accounts[\s\S]*REFERENCES auth_users\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('CONSTRAINT auth_accounts_provider_account UNIQUE (provider, provider_account_id)');
    expect(sql).toMatch(/auth_sessions[\s\S]*REFERENCES auth_users\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('CONSTRAINT auth_sessions_token_hash_unique UNIQUE (session_token_hash)');
    expect(sql).toContain("CHECK (session_token_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain('CREATE INDEX auth_sessions_expires_at_idx');
    expect(sql).toContain('PRIMARY KEY (identifier_normalized, token_hash)');
    expect(sql).toContain("CHECK (token_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain('CREATE INDEX auth_verification_tokens_expires_at_idx');
    expect(sql).toContain('CREATE TABLE auth_email_login_rate_limits');
  });
});
