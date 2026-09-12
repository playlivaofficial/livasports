import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { OddsPapiAuditClient } from '../src/providers/oddspapi/audit-client.mjs';

const file = 'output/m5-audit-private.json';
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { startedAt: new Date().toISOString(), requests: [], responses: {} };
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const client = new OddsPapiAuditClient(process.env.ODDSPAPI_API_KEY, state, save, 15);
const stage = process.argv[2] ?? 'account';
try {
  if (stage === 'account') {
    const account = await client.get('account', {});
    console.info(JSON.stringify({ stage, subscriptions: account.subscriptions.filter(s => s.is_active), requests: state.requests.length }));
  } else if (stage === 'catalog') {
    for (const [path, query] of [['bookmakers', {}], ['tournaments', { sportId: 10, language: 'en' }], ['markets', { language: 'en' }]]) {
      const rows = await client.get(path, query);
      const relevant = path === 'bookmakers' ? rows.filter(r => /betano|betsson/i.test(r.slug)) : path === 'tournaments'
        ? rows.filter(r => /brasileiro serie a|libertadores|liga mx|premier league/i.test(r.tournamentName))
        : rows.filter(r => r.sportId === 10 && !r.playerProp && r.period === 'fulltime' &&
          (/full time result|both teams to score/i.test(r.marketName) || (r.handicap === 2.5 && /over under full time/i.test(r.marketName))));
      console.info(JSON.stringify({ path, count: rows.length, relevant, requests: state.requests.length }));
    }
  } else if (stage === 'sample') {
    const catalog = state.responses['tournaments:{"sportId":10,"language":"en"}']?.data;
    if (!catalog) throw new Error('Run catalog first');
    const selectors = [['brasileiro-serie-a','brazil'],['liga-mx-apertura','mexico'],['premier-league','england'],['copa-libertadores','international-clubs']];
    const targets = selectors.map(([slug,category]) => {
      const found = catalog.filter(t => t.tournamentSlug === slug && t.categorySlug === category);
      if (found.length !== 1) throw new Error(`Ambiguous or missing tournament ${slug}/${category}`);
      return found[0];
    });
    for (const target of targets) {
      try {
        const rows = await client.get('fixtures', { tournamentId: target.tournamentId, statusId: 0, hasOdds: true, bookmakers: 'betano.bet.br,betsson', language: 'en' });
        console.info(JSON.stringify({ stage: 'fixtures', tournament: target, count: rows.length, sample: rows.slice(0, 2), requests: state.requests.length }));
      } catch (error) { if (!String(error.message).includes('FIXTURE_NOT_FOUND')) throw error; console.info(JSON.stringify({ tournamentId: target.tournamentId, state: 'NO_SAMPLE' })); }
    }
    for (const bookmaker of ['betano.bet.br','betsson']) {
      const rows = await client.get('odds-by-tournaments', { tournamentIds: targets.map(t => t.tournamentId).join(','), bookmaker, language: 'en', verbosity: 3, oddsFormat: 'decimal' });
      console.info(JSON.stringify({ stage: 'odds', bookmaker, count: rows.length, requests: state.requests.length,
        bookmakerDomains: [...new Set(rows.map(r => r.bookmakerOdds?.[bookmaker]?.fixturePath).filter(Boolean))],
        sample: rows.slice(0, 2).map(r => ({ ...r, bookmakerOdds: { [bookmaker]: { ...r.bookmakerOdds?.[bookmaker], markets: Object.fromEntries(Object.entries(r.bookmakerOdds?.[bookmaker]?.markets ?? {}).filter(([id]) => ['101','104','1010'].includes(id))) } } })) }));
    }
  } else if (stage === 'request') {
    const path = process.argv[3]; const query = JSON.parse(process.argv[4] ?? '{}');
    const response = await client.get(path, query);
    console.info(JSON.stringify({ stage, path, query, requests: state.requests.length, count: Array.isArray(response) ? response.length : 1,
      sample: Array.isArray(response) ? response.slice(0, 2) : response }));
  } else throw new Error('Unknown audit stage');
} catch (error) {
  console.error(JSON.stringify({ stage, error: String(error.message).split(process.env.ODDSPAPI_API_KEY ?? 'NO_KEY').join('[REDACTED]'), requests: state.requests.length }));
  process.exitCode = 1;
}
