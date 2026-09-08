import pg from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('Database connection is not configured');

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(`
    SELECT c.slug,c.name,f.id,f.kickoff,f.status,ht.name AS home,at.name AS away,pm.provider_entity_id
    FROM fixtures f
    JOIN competitions c ON c.id=f.competition_id
    JOIN teams ht ON ht.id=f.home_team_id
    JOIN teams at ON at.id=f.away_team_id
    LEFT JOIN provider_entity_mappings pm ON pm.livasports_entity_id=f.id
      AND pm.provider='SPORTMONKS' AND pm.entity_type='FIXTURE'
    WHERE c.slug IN ('brasileirao-serie-a','liga-mx','premier-league','copa-do-brasil','copa-libertadores')
    ORDER BY c.slug, CASE WHEN f.status='FINISHED' THEN 0 ELSE 1 END, f.kickoff DESC
  `);
  const samples = {};
  for (const row of result.rows) {
    samples[row.slug] ??= [];
    if (samples[row.slug].length < 4) samples[row.slug].push(row);
  }
  console.log(JSON.stringify(samples, null, 2));
} finally {
  await client.end();
}
