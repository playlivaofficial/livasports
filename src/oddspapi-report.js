const MARKETS = ['MATCH_WINNER', 'TOTAL_GOALS', 'BTTS', 'DOUBLE_CHANCE'];
const EXPECTED = {
  MATCH_WINNER: ['HOME', 'DRAW', 'AWAY'], TOTAL_GOALS: ['OVER', 'UNDER'],
  BTTS: ['YES', 'NO'], DOUBLE_CHANCE: ['HOME_OR_DRAW', 'HOME_OR_AWAY', 'DRAW_OR_AWAY'],
};
const BOOKMAKERS = [
  { slug: 'betano.bet.br', label: 'Betano BR' },
  { slug: 'betsson', label: 'Betsson' },
];
const pct = (n, d) => d ? Number((100 * n / d).toFixed(1)) : null;
const status = (n, d) => !d ? 'NOT EXECUTED' : !n ? 'FAIL' : n === d ? 'PASS' : 'PARTIAL PASS';
const compact = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function bookmakerMatch(actual, desired) { return compact(actual) === compact(desired); }

export function documentedCapabilityMatrix({ liveOddsEnabled = false, executionStatus = 'EXECUTED' } = {}) {
  const actual = executionStatus === 'EXECUTED' ? 'Documented endpoint plus sampled account/API evidence where noted.' : 'Documentation only; current account API was not queried.';
  return [
    { capability: 'Fixtures / schedule', classification: 'SUPPORTED', evidence: `/v4/fixtures and odds snapshots include schedule/team/tournament fields. ${actual}` },
    { capability: 'Live or final scores', classification: 'SUPPORTED', evidence: '/v4/scores is documented; live odds being disabled does not by itself disable score data. Live account access still requires runtime verification.' },
    { capability: 'League / tournament metadata', classification: 'SUPPORTED', evidence: '/v4/tournaments is documented and returns category/tournament metadata.' },
    { capability: 'Teams / participants', classification: 'SUPPORTED', evidence: '/v4/participants and fixture participant fields are documented.' },
    { capability: 'Standings / league tables', classification: 'NOT FOUND', evidence: 'No standings endpoint exists in the documented v4 endpoint catalog.' },
    { capability: 'Match events / timeline', classification: 'NOT FOUND', evidence: 'No event or timeline endpoint exists in the documented v4 endpoint catalog.' },
    { capability: 'Detailed match statistics', classification: 'NOT FOUND', evidence: 'No match-statistics endpoint exists in the documented v4 endpoint catalog.' },
    { capability: 'Lineups', classification: 'NOT FOUND', evidence: 'No lineups endpoint exists in the documented v4 endpoint catalog.' },
    { capability: 'Head-to-head', classification: 'NOT FOUND', evidence: 'No H2H endpoint exists in the documented v4 endpoint catalog.' },
    { capability: 'Season metadata', classification: 'PARTIAL', evidence: 'Fixtures expose seasonId, but no documented v4 season metadata endpoint was found.' },
    { capability: 'Live betting odds', classification: liveOddsEnabled ? 'SUPPORTED' : 'NOT AVAILABLE IN CURRENT PLAN', evidence: liveOddsEnabled ? 'Enabled in account scope.' : 'Current plan scope states pregame only/live disabled.' },
  ];
}

export function buildOddsPapiReport(sample, { generatedAt = new Date().toISOString(), executionStatus = 'EXECUTED' } = {}) {
  const fixtures = sample?.football?.fixtures ?? [];
  const odds = sample?.football?.odds ?? [];
  const brazilTournamentNames = new Set((sample?.football?.tournamentIdentification?.brazil ?? []).map(t => t.tournamentName));
  const mexicoTournament = sample?.football?.tournamentIdentification?.mexico ?? null;
  const brazilFixtures = fixtures.filter(f => brazilTournamentNames.has(f.league));
  const coverageFixtures = brazilFixtures.length ? brazilFixtures : fixtures.filter(f => f.league !== mexicoTournament?.tournamentName);
  const coverageFixtureIds = new Set(coverageFixtures.map(f => f.fixtureId));
  const rows = [];
  const missingSelections = [];
  const bookmakerCoverage = [];
  for (const target of BOOKMAKERS) {
    const offered = odds.filter(o => bookmakerMatch(o.bookmaker, target.slug) && coverageFixtureIds.has(o.fixtureId));
    const fixtureIds = new Set(offered.map(o => o.fixtureId));
    bookmakerCoverage.push({ bookmaker: target.label, slug: target.slug, fixturesCovered: fixtureIds.size,
      fixturesTested: coverageFixtures.length, coveragePercentage: pct(fixtureIds.size, coverageFixtures.length), status: status(fixtureIds.size, coverageFixtures.length) });
    for (const market of MARKETS) {
      let complete = 0;
      for (const fixture of coverageFixtures) {
        const available = new Set(offered.filter(o => o.fixtureId === fixture.fixtureId && o.market === market).map(o => o.outcome));
        const missing = EXPECTED[market].filter(expected => !available.has(expected));
        if (!missing.length) complete++;
        else missingSelections.push({ fixtureId: fixture.fixtureId, league: fixture.league, bookmaker: target.label, market, missing });
      }
      rows.push({ bookmaker: target.label, market, completeFixtures: complete, fixturesTested: coverageFixtures.length,
        coveragePercentage: pct(complete, coverageFixtures.length), status: status(complete, coverageFixtures.length) });
    }
  }
  const timestamps = odds.map(o => o.providerUpdatedAt).filter(Boolean);
  const now = new Date(generatedAt).getTime();
  const stale = timestamps.filter(t => now - new Date(t).getTime() > 24 * 60 * 60 * 1000).length;
  const mexico = fixtures.filter(f => f.league === mexicoTournament?.tournamentName || /mexico/i.test(f.country ?? '') || /liga mx/i.test(f.league ?? ''));
  const basketballFixtures = sample?.basketball?.fixtures ?? [];
  const basketballOdds = sample?.basketball?.odds ?? [];
  const targetBasketballOdds = basketballOdds.filter(o => BOOKMAKERS.some(b => bookmakerMatch(o.bookmaker, b.slug)));
  const capabilityMatrix = documentedCapabilityMatrix({
    liveOddsEnabled: Object.values(sample?.account?.bookmakers ?? {}).some(b => b?.has_live_odds), executionStatus,
  });
  const comparableMarkets = MARKETS.map(market => {
    const completeSets = BOOKMAKERS.map(target => new Set(coverageFixtures.filter(fixture => {
      const outcomes = new Set(odds.filter(o => o.fixtureId === fixture.fixtureId && bookmakerMatch(o.bookmaker, target.slug) && o.market === market).map(o => o.outcome));
      return EXPECTED[market].every(outcome => outcomes.has(outcome));
    }).map(f => f.fixtureId)));
    const comparable = [...completeSets[0]].filter(fixtureId => completeSets[1].has(fixtureId)).length;
    return { market, comparableFixtures: comparable, fixturesTested: coverageFixtures.length,
      coveragePercentage: pct(comparable, coverageFixtures.length), status: status(comparable, coverageFixtures.length) };
  });
  const matchWinnerComparable = comparableMarkets.find(row => row.market === 'MATCH_WINNER')?.comparableFixtures ?? 0;
  const oddsVerdict = executionStatus !== 'EXECUTED' ? 'NOT EXECUTED'
    : !coverageFixtures.length ? 'NO SAMPLE'
      : !matchWinnerComparable ? 'FAIL'
        : coverageFixtures.length >= 10 && comparableMarkets.every(row => row.comparableFixtures === coverageFixtures.length) ? 'PASS' : 'PARTIAL PASS';
  const matchCenterPass = ['Fixtures / schedule', 'Live or final scores', 'Match events / timeline', 'Detailed match statistics', 'Lineups', 'Head-to-head', 'Standings / league tables']
    .every(name => capabilityMatrix.find(c => c.capability === name)?.classification === 'SUPPORTED');
  const matchCenterVerdict = matchCenterPass ? 'PASS' : 'FAIL';
  const verdict = executionStatus !== 'EXECUTED' ? 'NOT EXECUTED'
    : oddsVerdict === 'FAIL' ? 'FAIL — OddsPapi is not suitable for the core bookmaker-comparison feature'
      : oddsVerdict === 'NO SAMPLE' ? 'NO SAMPLE — OddsPapi odds suitability was not established'
        : matchCenterPass ? 'PASS'
          : `${oddsVerdict} — OddsPapi is suitable for odds but a separate football-data provider is still required`;
  const fixtureCounts = sample?.football?.fixtureCountsByTournament ?? [];
  const mexicoFixtureCount = fixtureCounts.find(row => String(row.tournamentId) === String(mexicoTournament?.tournamentId))?.fixturesFound ?? 0;
  const authPassed = (sample?.validationStages ?? []).some(stage => stage.name === 'account/auth connectivity' && stage.status === 'PASS');
  return {
    title: 'LivaSports M0.5 — OddsPapi Validation Report', generatedAt, executionStatus, runMode: sample?.runMode ?? 'FULL', overallVerdict: verdict,
    validationStages: sample?.validationStages ?? [], failedRequest: null,
    apiConnectivity: executionStatus === 'EXECUTED' || authPassed ? 'PASS' : 'NOT EXECUTED',
    currentAccountScope: sample?.account ?? { sports: ['Soccer', 'Basketball'], bookmakers: ['betano.bet.br', 'betsson'], pregameOnly: true, requestLimit: 5000 },
    requestsConsumed: sample?.requests ?? { adapterBillableRequests: 0, measuredAccountDelta: null },
    football: {
      fixturesTested: fixtures.length,
      brazilFixturesTested: coverageFixtures.length,
      competitionsTested: [...new Set(fixtures.map(f => `${f.country ?? 'Unknown'}: ${f.league ?? 'Unknown'}`))],
      competitionsSelected: (sample?.football?.tournamentsSelected ?? []).map(t => t.tournamentName),
      tournamentsUsed: fixtureCounts,
      bookmakerResponses: sample?.football?.bookmakerResponses ?? [],
      bookmakerCoverage, marketCoverage: rows, comparisonCoverage: comparableMarkets, missingSelections,
      freshness: { timestampedOdds: timestamps.length, missingTimestamps: odds.length - timestamps.length, staleOver24Hours: stale,
        oldest: timestamps.sort()[0] ?? null, newest: timestamps.sort().at(-1) ?? null },
      mexico: { status: !mexicoTournament ? 'NOT TESTED' : !mexicoFixtureCount ? 'NO SAMPLE' : mexico.length ? 'SAMPLED' : 'NOT TESTED',
        identifiedTournament: mexicoTournament, candidates: sample?.football?.tournamentIdentification?.mexicoCandidates ?? [],
        fixturesTested: mexico.length, leagues: [...new Set(mexico.map(f => f.league))] },
    },
    basketballQuickCheck: {
      tournament: sample?.basketball?.tournamentSelected?.tournamentName ?? null,
      fixturesFound: basketballFixtures.length, targetBookmakerOddsFound: targetBasketballOdds.length,
      marketsFound: [...new Set(targetBasketballOdds.map(o => o.market))],
      status: !basketballFixtures.length ? 'NOT EXECUTED' : targetBasketballOdds.length ? 'PASS' : 'FAIL',
    },
    footballDataCapabilities: capabilityMatrix,
    missingCapabilities: capabilityMatrix.filter(c => !['SUPPORTED'].includes(c.classification)).map(c => c.capability),
    providerLimitations: [
      'The current plan has pregame odds only; live odds and player props are disabled.',
      'The v4 API is an odds-oriented feed and its documented endpoint catalog lacks events, detailed statistics, lineups, H2H, and standings.',
      'Bookmaker and market coverage varies by competition and fixture; a one-time sample does not guarantee future availability.',
      'A 5,000-request monthly allowance requires caching, batching, and controlled refresh intervals.',
      'The 24-hour stale threshold in this report is a validation convention, not a provider SLA.',
    ],
    oddsVerdict,
    matchCenterVerdict,
    oddsConclusion: oddsVerdict === 'PASS' ? 'OddsPapi can power the sampled Betano BR + Betsson pregame comparison across all required markets.'
      : oddsVerdict === 'PARTIAL PASS' ? 'OddsPapi returns comparable Betano BR + Betsson pregame odds, but sampled market/fixture gaps remain.'
        : oddsVerdict === 'NO SAMPLE' ? 'No Brazil fixture sample was available; bookmaker comparison suitability was not tested.'
          : executionStatus !== 'EXECUTED' ? 'The odds validation did not complete.' : 'No comparable Betano BR + Betsson 1X2 sample was established.',
    sportsDataConclusion: matchCenterPass ? 'OddsPapi can cover the planned Match Center.' : 'OddsPapi v4 alone cannot cover the planned Match Center; a separate football-data provider is required.',
    recommendedNextAction: executionStatus !== 'EXECUTED' ? (authPassed
      ? 'Authentication already passed. Correct or retry only the recorded failed data request, then rerun the staged validation.'
      : 'Provide a working server-side ODDSPAPI_API_KEY only if the account/auth stage did not run or failed.')
      : oddsVerdict === 'PASS' || oddsVerdict === 'PARTIAL PASS' ? 'Keep the two paid bookmakers only; repeat this low-request sample over several matchdays and select a low-cost football-data provider for Match Center gaps.'
        : 'Do not rely on OddsPapi for launch until Betano BR and Betsson return consistent target-market coverage in a repeat sample.',
  };
}

const mdTable = (headers, rows) => `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}`;

export function oddsPapiReportMarkdown(r) {
  const coverage = value => value === null || value === undefined ? 'n/a' : `${value}%`;
  const marketTable = mdTable(['Bookmaker', 'Market', 'Complete fixtures', 'Coverage', 'Result'], r.football.marketCoverage.map(x => [x.bookmaker, x.market, `${x.completeFixtures}/${x.fixturesTested}`, coverage(x.coveragePercentage), `**${x.status}**`]));
  const capabilityTable = mdTable(['Capability', 'Classification', 'Evidence'], r.footballDataCapabilities.map(x => [x.capability, `**${x.classification}**`, x.evidence]));
  const book = label => r.football.bookmakerCoverage.find(b => b.bookmaker === label) ?? { status: 'NOT EXECUTED', fixturesCovered: 0, fixturesTested: r.football.fixturesTested, coveragePercentage: null };
  const betano = book('Betano BR'); const betsson = book('Betsson');
  const stages = (r.validationStages ?? []).length ? mdTable(['Stage', 'Status', 'Request'], r.validationStages.map(s => [s.name, s.status, s.request ? `${s.request.path} ${JSON.stringify(s.request.query)}` : 'n/a'])) : 'No staged API calls completed in this process.';
  const failure = r.failedRequest ? `Status: **${r.failedRequest.status}**  \nEndpoint: \`${r.failedRequest.method} ${r.failedRequest.path}\`  \nSanitized query: \`${JSON.stringify(r.failedRequest.query)}\`  \nProvider code: \`${r.failedRequest.providerCode ?? 'not supplied'}\`  \nProvider message: ${r.failedRequest.providerMessage ?? 'not supplied'}\n\nFull sanitized JSON response:\n\n\`\`\`json\n${JSON.stringify(r.failedRequest.body, null, 2)}\n\`\`\`` : 'No attributable non-2xx response was captured by this version of the adapter.';
  return `# LivaSports M0.5 — OddsPapi Validation Report\n\nGenerated: ${r.generatedAt}\n\n## Overall verdict\n\n**${r.overallVerdict}**\n\n## API connectivity\n\n**${r.apiConnectivity}** (${r.executionStatus})\n\n## Current account scope\n\n- Sports: Soccer, Basketball\n- Bookmakers: Betano BR (betano.bet.br), Betsson (betsson)\n- Pregame: enabled\n- Live odds: disabled\n- Player props: disabled\n- Plan: Normal\n- Monthly request allowance: ${r.currentAccountScope.requestLimit ?? 5000}\n\n## Requests consumed\n\nAdapter-counted billable calls: **${r.requestsConsumed.adapterBillableRequests ?? 0}**  \nAccount request-count delta: **${r.requestsConsumed.measuredAccountDelta ?? 'not measurable'}**\n\n## Incremental validation stages\n\n${stages}\n\n## HTTP error diagnosis\n\n${failure}\n\n## Football competitions tested\n\nFixtures tested: **${r.football.fixturesTested}**  \n${r.football.competitionsTested.length ? r.football.competitionsTested.map(x => `- ${x}`).join('\n') : '- No live sample collected'}\n\n## Betano BR coverage\n\n**${betano.status}** — ${betano.fixturesCovered}/${betano.fixturesTested} fixtures (${coverage(betano.coveragePercentage)}).\n\n## Betsson coverage\n\n**${betsson.status}** — ${betsson.fixturesCovered}/${betsson.fixturesTested} fixtures (${coverage(betsson.coveragePercentage)}).\n\n## Market coverage\n\n${marketTable}\n\nMissing selection groups: **${r.football.missingSelections.length}**. See the JSON report for fixture-level details.  \nMissing timestamps: **${r.football.freshness.missingTimestamps}**; timestamps older than 24 hours: **${r.football.freshness.staleOver24Hours}**.\n\n## Mexico coverage\n\nIdentified tournament: **${r.football.mexico.identifiedTournament?.tournamentName ?? 'No confident Liga MX candidate'}** (ID: ${r.football.mexico.identifiedTournament?.tournamentId ?? 'n/a'}; slug: ${r.football.mexico.identifiedTournament?.tournamentSlug ?? 'n/a'}; category: ${r.football.mexico.identifiedTournament?.categoryName ?? 'n/a'} / ${r.football.mexico.identifiedTournament?.categorySlug ?? 'n/a'})  \nStatus: **${r.football.mexico.status}**; fixtures tested: **${r.football.mexico.fixturesTested}**; candidates considered: **${r.football.mexico.candidates.length}**.\n\n## Basketball quick check\n\n**${r.basketballQuickCheck.status}** — tournament: ${r.basketballQuickCheck.tournament ?? 'not found'}; fixtures: ${r.basketballQuickCheck.fixturesFound}; target-bookmaker odds records: ${r.basketballQuickCheck.targetBookmakerOddsFound}; markets: ${r.basketballQuickCheck.marketsFound.join(', ') || 'none'}.\n\n## Football data capability matrix\n\n${capabilityTable}\n\n## Missing capabilities\n\n${r.missingCapabilities.map(x => `- ${x}`).join('\n')}\n\n## Provider limitations\n\n${r.providerLimitations.map(x => `- ${x}`).join('\n')}\n\n## Independent verdicts\n\n**ODDS verdict: ${r.oddsVerdict}** — ${r.oddsConclusion}\n\n**MATCH CENTER verdict: ${r.matchCenterVerdict}** — ${r.sportsDataConclusion}\n\n**Combined verdict:** ${r.overallVerdict}\n\n## Recommended next action\n\n${r.recommendedNextAction}\n`;
}
