import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/report.js';

test('marks complete canonical markets PASS and absent markets FAIL', () => {
  const fixture = { fixtureId: '1', country: 'Brazil', competition: 'Serie A' };
  const odds = ['HOME', 'DRAW', 'AWAY'].map(outcome => ({ ...fixture, bookmaker: 'Betano', market: 'MATCH_WINNER', outcome, providerUpdatedAt: '2026-01-01T00:00:00Z' }));
  const report = buildReport({ provider: 'fake', fixtures: [fixture], odds, diagnostics: [] }, { minFixtures: 1 });
  const winner = report.marketCoveragePerBookmaker.find(x => x.market === 'MATCH_WINNER');
  const btts = report.marketCoveragePerBookmaker.find(x => x.market === 'BTTS');
  assert.equal(winner.status, 'PASS');
  assert.equal(btts.status, 'FAIL');
});
