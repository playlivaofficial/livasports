const MARKETS = ['MATCH_WINNER', 'TOTAL_GOALS', 'BTTS', 'DOUBLE_CHANCE'];
const EXPECTED = {
  MATCH_WINNER: ['HOME', 'DRAW', 'AWAY'],
  TOTAL_GOALS: ['OVER', 'UNDER'],
  BTTS: ['YES', 'NO'],
  DOUBLE_CHANCE: ['HOME_OR_DRAW', 'HOME_OR_AWAY', 'DRAW_OR_AWAY'],
};

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : 'n/a'; }
function status(found, total) { return found === 0 ? 'FAIL' : found === total ? 'PASS' : 'PARTIAL PASS'; }
function key(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function buildReport(sample, { minFixtures = 20, generatedAt = new Date().toISOString() } = {}) {
  const fixturesByGeo = Object.groupBy(sample.fixtures, f => f.country);
  const bookmakerNames = [...new Set(sample.odds.map(o => o.bookmaker))].sort();
  const rows = [];
  const missingSelections = [];
  for (const bookmaker of bookmakerNames) {
    const offered = sample.odds.filter(o => o.bookmaker === bookmaker);
    const relevantFixtures = new Set(offered.map(o => o.fixtureId));
    for (const market of MARKETS) {
      let complete = 0;
      for (const fixtureId of relevantFixtures) {
        const outcomes = new Set(offered.filter(o => o.fixtureId === fixtureId && o.market === market).map(o => o.outcome));
        const missing = EXPECTED[market].filter(x => !outcomes.has(x));
        if (!missing.length) complete++;
        else if (outcomes.size) missingSelections.push({ fixtureId, bookmaker, market, missing });
      }
      rows.push({ bookmaker, market, fixturesComplete: complete, fixturesOffered: relevantFixtures.size,
        coverage: pct(complete, relevantFixtures.size), status: status(complete, relevantFixtures.size) });
    }
  }
  const target = name => {
    const actual = bookmakerNames.find(b => key(b) === key(name));
    const geoFixtures = sample.fixtures.filter(f => f.country.toLowerCase() === 'brazil').length;
    const covered = actual ? new Set(sample.odds.filter(o => o.bookmaker === actual && o.country.toLowerCase() === 'brazil').map(o => o.fixtureId)).size : 0;
    return { requestedName: name, providerName: actual ?? null, fixturesCovered: covered, fixturesTested: geoFixtures,
      coverage: pct(covered, geoFixtures), status: status(covered, geoFixtures) };
  };
  const timestamps = sample.odds.map(o => o.providerUpdatedAt).filter(Boolean).sort();
  const mexOdds = sample.odds.filter(o => o.country.toLowerCase() === 'mexico');
  return {
    meta: { provider: sample.provider, generatedAt, verdict: sample.fixtures.length < minFixtures ? 'FAIL' : (missingSelections.length ? 'PARTIAL PASS' : 'PASS') },
    fixturesTested: sample.fixtures.length,
    fixturesByGeo: Object.fromEntries(Object.entries(fixturesByGeo).map(([g, fs]) => [g, fs.length])),
    leaguesTested: [...new Set(sample.fixtures.map(f => `${f.country}: ${f.competition}`))].sort(),
    bookmakersFound: bookmakerNames,
    brazil: { betano: target('Betano'), betsson: target('Betsson'), kto: target('KTO') },
    mexico: {
      fixturesTested: sample.fixtures.filter(f => f.country.toLowerCase() === 'mexico').length,
      bookmakersFound: [...new Set(mexOdds.map(o => o.bookmaker))].sort(),
      note: 'Availability is inferred from returned odds for Mexican competitions; Sportmonks does not assert bettor residency/licensing eligibility.',
    },
    marketCoveragePerBookmaker: rows,
    missingSelections,
    freshness: { oldestProviderTimestamp: timestamps[0] ?? null, newestProviderTimestamp: timestamps.at(-1) ?? null,
      recordsWithTimestamp: timestamps.length, totalOddsRecords: sample.odds.length },
    providerLimitations: [
      ...sample.diagnostics,
      'Bookmaker presence on a fixture is not proof that the bookmaker accepts users in a given country.',
      'Production suitability requires sufficient fixture count, all expected selections, and acceptable timestamp freshness.',
    ],
  };
}

function table(rows) {
  return ['| Bookmaker | Market | Complete / offered fixtures | Coverage | Result |', '|---|---:|---:|---:|---:|',
    ...rows.map(r => `| ${r.bookmaker} | ${r.market} | ${r.fixturesComplete} / ${r.fixturesOffered} | ${r.coverage} | **${r.status}** |`)].join('\n');
}
export function reportMarkdown(r) {
  const targets = Object.values(r.brazil).map(x => `- ${x.requestedName}: **${x.status}** — ${x.fixturesCovered}/${x.fixturesTested} fixtures (${x.coverage})${x.providerName ? '' : '; bookmaker not returned'}`).join('\n');
  return `# LivaSports M0 — Sportmonks validation report\n\nGenerated: ${r.meta.generatedAt}\n\n## Overall verdict: ${r.meta.verdict}\n\nFixtures tested: **${r.fixturesTested}**  \nLeagues: ${r.leaguesTested.join(', ') || 'none'}  \nBookmakers found: ${r.bookmakersFound.join(', ') || 'none'}\n\n## Brazil bookmaker coverage\n\n${targets}\n\n## Mexico bookmaker coverage\n\nFixtures: ${r.mexico.fixturesTested}  \nBookmakers returned: ${r.mexico.bookmakersFound.join(', ') || 'none'}\n\n${r.mexico.note}\n\n## Market coverage per bookmaker\n\n${table(r.marketCoveragePerBookmaker)}\n\n## Missing selections\n\n${r.missingSelections.length ? 'See report.json for the structured list (' + r.missingSelections.length + ' incomplete fixture/bookmaker/market groups).' : 'None.'}\n\n## Odds freshness\n\nOldest: ${r.freshness.oldestProviderTimestamp ?? 'not supplied'}  \nNewest: ${r.freshness.newestProviderTimestamp ?? 'not supplied'}  \nTimestamped records: ${r.freshness.recordsWithTimestamp}/${r.freshness.totalOddsRecords}\n\n## Provider limitations\n\n${r.providerLimitations.map(x => `- ${x}`).join('\n')}\n\n## Production conclusion\n\n${r.meta.verdict === 'PASS' ? 'PASS: the sampled feed meets the M0 checks. Repeat over time and confirm geo licensing before production.' : r.meta.verdict === 'PARTIAL PASS' ? 'PARTIAL PASS: useful coverage exists, but gaps above must be resolved before production.' : 'FAIL: the provider has not demonstrated the minimum evidence required for the LivaSports comparison engine.'}\n`;
}
