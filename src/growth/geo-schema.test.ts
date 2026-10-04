import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('additive GEO growth state',()=>{
  const sql=readFileSync(new URL('../../db/migrations/058_geo_growth.sql',import.meta.url),'utf8');
  it('does not mutate legacy BR priority, media, history or attribution schema during Preview',()=>{
    expect(sql).not.toMatch(/(?:ALTER TABLE|UPDATE|DELETE FROM|DROP TABLE)\s+growth_/i);
    expect(sql).not.toContain('growth_seo_priorities');
    expect(sql).not.toContain('growth_seo_attribution_dimensions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS growth_geo_priorities');
    expect(sql).toContain('CREATE OR REPLACE VIEW growth_geo_attribution_dimensions');
  });
  it('caps independent current lists at five per GEO and binds locale/canonical identity',()=>{
    expect(sql).toContain("geo IN('MX','CO','PE')");expect(sql).toContain('PRIMARY KEY(geo,fixture_id)');
    expect(sql).toContain('CHECK(priority_rank BETWEEN 1 AND 5)');
    expect(sql).toContain('ON growth_geo_priorities(geo,priority_rank) WHERE active');
    expect(sql).toContain("canonical_url LIKE 'https://livasports.com/'||locale||'/%'");
    expect(sql).toContain("(geo='MX' AND locale='mx') OR (geo='CO' AND locale='co') OR (geo='PE' AND locale='pe')");
    expect(sql).toContain('CHECK(jsonb_array_length(current_list)<=5)');
  });
  it('persists auditable bounded weekly learning without creating an analytics event store',()=>{
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS growth_geo_demand_history');
    expect(sql).toContain('PRIMARY KEY(geo,competition_slug,evaluated_week)');
    expect(sql).toContain('CHECK(new_adjustment BETWEEN -.12 AND .12)');
    expect(sql).toContain('previous_adjustment numeric NOT NULL');
    expect(sql).not.toMatch(/CREATE TABLE.*analytics/);
  });
});
