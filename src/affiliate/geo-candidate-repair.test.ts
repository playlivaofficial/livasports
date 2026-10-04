import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(new URL('../../db/migrations/062_geo_candidate_repair.sql',import.meta.url),'utf8');
describe('additive legacy GEO candidate repair',()=>{
  it('backfills candidate defaults without overriding a manually configured revision',()=>{
    expect(sql).toContain('currency=COALESCE(g.currency,v.currency)');
    expect(sql).toContain('CASE WHEN g.public_priority=100 THEN v.priority ELSE g.public_priority END');
    expect(sql).toContain("g.commercial_version=0 AND g.commercial_status IN ('CANDIDATE','PENDING')");
    expect(sql).toContain('(g.currency IS NULL OR g.public_priority=100)');
  });
  it('retires precisely the historical Betano BR Mexico row and never creates a fifth Mexico candidate',()=>{
    expect(sql).toContain("b.provider_slug='betano.bet.br' AND c.iso2='MX'");
    expect(sql).toContain("commercial_status='UNAVAILABLE',affiliate_enabled=false");
    expect(sql).not.toMatch(/INSERT INTO|DELETE FROM|DROP TABLE|TRUNCATE/i);
    expect(sql.match(/\('MX',/g)).toHaveLength(4);
  });
  it('does not change feed eligibility, verification evidence, campaigns or quote/history records',()=>{
    expect(sql).not.toMatch(/(?:SET|,)\s*(?:odds_enabled|sportsbook_enabled|comparison_enabled|verified_at|verification_state|legal_status|legal_reference|source_domains|destination_domains)\s*=/i);
    expect(sql).not.toMatch(/(?:UPDATE|ALTER TABLE|DELETE FROM)\s+(?:affiliate_|operator_|odds_)/i);
    expect(sql).toMatch(/^BEGIN;/);expect(sql.trim()).toMatch(/COMMIT;$/);
  });
});
