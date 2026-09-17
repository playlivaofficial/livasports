import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('db/migrations/023_p1_2_user_favorites.sql','utf8');
const files=readdirSync('db/migrations').filter(file=>/^\d+_/.test(file)).sort();

describe('migration 023 user favorites schema',()=>{
  it('is the additive successor of 022 and never edits earlier files',()=>{
    expect(files.at(-1)).toBe('024_p2_sitemap_player_indexes.sql');expect(files).toContain('023_p1_2_user_favorites.sql');
    expect(files).toContain('022_p1_1_user_auth.sql');
    expect(sql.startsWith('BEGIN;')).toBe(true);
    expect(sql.trim().endsWith('COMMIT;'));
    expect(sql).not.toContain('ALTER TABLE auth_users');
    expect(sql).not.toContain('odds_current');
  });

  it('creates explicit favorite tables with uuid FKs, uniqueness and user lookup indexes',()=>{
    expect(sql).toMatch(/CREATE TABLE user_favorite_teams \([\s\S]*REFERENCES auth_users\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/user_favorite_teams[\s\S]*REFERENCES teams\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('PRIMARY KEY (user_id, team_id)');
    expect(sql).toMatch(/CREATE TABLE user_favorite_competitions \([\s\S]*REFERENCES competitions\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('PRIMARY KEY (user_id, competition_id)');
    expect(sql).toMatch(/CREATE TABLE user_favorite_fixtures \([\s\S]*REFERENCES fixtures\(id\) ON DELETE CASCADE/);
    expect(sql).toContain('PRIMARY KEY (user_id, fixture_id)');
    expect(sql).toContain('CREATE INDEX user_favorite_teams_user_created_idx');
    expect(sql).toContain('CREATE INDEX user_favorite_competitions_user_created_idx');
    expect(sql).toContain('CREATE INDEX user_favorite_fixtures_user_created_idx');
  });
});
