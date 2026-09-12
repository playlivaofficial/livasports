import { writeFile } from 'node:fs/promises';
import { databaseUrl, PostgresDatabaseClient } from '../src/database/client';
const url = databaseUrl();
if (!url) throw new Error('Database configuration missing');
const db = new PostgresDatabaseClient(url);
try {
  const counts: Record<string, number> = {};
  for (const table of ['competitions','seasons','teams','fixtures','provider_entity_mappings','odds_current','odds_history']) {
    counts[table] = Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  }
  const competitions = (await db.query(`SELECT c.id,c.name,c.slug,co.iso2,c.enabled,m.provider_entity_id AS sportmonks_id
    FROM competitions c LEFT JOIN countries co ON co.id=c.country_id LEFT JOIN provider_entity_mappings m
    ON m.livasports_entity_id=c.id AND m.provider='SPORTMONKS' AND m.entity_type='COMPETITION' ORDER BY c.slug`)).rows;
  const fixtures = (await db.query(`SELECT f.id,f.public_id,f.sport_id,f.competition_id,c.slug AS competition,f.kickoff,f.status,
    f.home_team_id,f.away_team_id,h.name AS home,h.short_name AS home_short,a.name AS away,a.short_name AS away_short
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id
    WHERE f.kickoff BETWEEN now()-interval '1 day' AND now()+interval '30 days' ORDER BY f.kickoff`)).rows;
  const bookmakers=(await db.query(`SELECT b.id,b.provider_slug,b.affiliate_status,b.affiliate_url IS NOT NULL AS has_affiliate_url,
    co.iso2,g.odds_enabled,g.comparison_enabled,g.affiliate_enabled,g.verified_at
    FROM bookmakers b LEFT JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id LEFT JOIN countries co ON co.id=g.country_id`)).rows;
  const mappings=(await db.query("SELECT entity_type,provider_entity_id,livasports_entity_id,metadata FROM provider_entity_mappings WHERE provider='ODDSPAPI'")).rows;
  const migrations=(await db.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows;
  const result={at:new Date().toISOString(),counts,competitions,fixtures,bookmakers,mappings,migrations};
  await writeFile('output/m5-baseline-private.json',JSON.stringify(result,null,2));
  console.info(JSON.stringify({...result,fixtures:fixtures.filter(f=>/brasile|liga-mx|premier|libertadores/.test(f.competition))}));
} catch { console.error('Read-only database audit failed; no credentials logged'); process.exitCode=1; }
finally { await db.close(); }
