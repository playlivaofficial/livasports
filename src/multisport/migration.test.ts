import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

describe('V3 snapshot migration static safety audit (no database execution)',()=>{
  const sql=readFileSync('db/migrations/073_v3_sports_snapshots.sql','utf8').replace(/--[^\r\n]*/g,'');
  const statements=sql.split(';').map(statement=>statement.trim()).filter(Boolean);
  it('is a bounded transaction containing repeatable CREATE IF NOT EXISTS statements',()=>{
    expect(statements[0]).toBe('BEGIN');expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.slice(1,3)).toEqual(["SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '30s'"]);
    for(const statement of statements.slice(3,-1))expect(statement).toMatch(/^CREATE (?:TABLE|INDEX) IF NOT EXISTS sports_[a-z_]+\b/);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE)\b/i);
  });
  it('adds only the three new snapshot/audit/refresh tables and indexes',()=>{
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match=>match[1])).toEqual(['sports_snapshots','sports_snapshot_audit','sports_source_refresh']);
    expect([...sql.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map(match=>match[1])).toEqual(['sports_snapshots_published','sports_snapshot_audit_key','sports_snapshot_audit_recent']);
    expect([...sql.matchAll(/REFERENCES\s+(\w+)/g)].map(match=>match[1])).toEqual(['sports_snapshots']);
  });
  it('bounds lock waits and statements transaction-locally in every pending release migration',()=>{
    for(const file of ['073_v3_sports_snapshots.sql','074_v3_news_automation.sql','075_v3_news_review_evidence.sql']){
      const migration=readFileSync(`db/migrations/${file}`,'utf8');
      expect(migration).toMatch(/^BEGIN;\s+SET LOCAL lock_timeout = '5s';\s+SET LOCAL statement_timeout = '30s';/);
      expect(migration.trim()).toMatch(/COMMIT;$/);
    }
  });
  it('retains edition uniqueness, content hashes, review metadata and durable backoff',()=>{
    for(const fragment of ['UNIQUE (competition_id,season)',"CHECK (snapshot_key=competition_id||':'||season)",'content_hash','reviewed_revision','reviewed_at','published jsonb','archived boolean','next_allowed_at timestamptz NOT NULL','lease_token text',"'auto-publish'"]){expect(sql).toContain(fragment);}
  });
  it('identifies both public collectors as LivaSports',()=>{
    for(const file of ['src/multisport/openligadb.ts','src/multisport/openfootball.ts'])expect(readFileSync(file,'utf8')).toContain("'User-Agent':'LivaSports-DataCollector/3.0 (+https://livasports.com)'");
  });
  it('rejects absent JSON identities and non-positive review/audit revisions at the database boundary',()=>{
    expect(sql.match(/IS TRUE/g)).toHaveLength(2);
    expect(sql).toContain("jsonb_typeof(draft->'competitionId')='string'");
    expect(sql).toContain("jsonb_typeof(published->'season')='string'");
    expect(sql).toContain('reviewed_revision BETWEEN 1 AND revision');
    expect(sql.match(/revision integer NOT NULL(?: DEFAULT 1)? CHECK \(revision>0\)/g)).toHaveLength(2);
  });
});
