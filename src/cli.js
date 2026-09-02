import { mkdir, writeFile } from 'node:fs/promises';
import { SportmonksAdapter } from './provider/SportmonksAdapter.js';
import { buildReport, reportMarkdown } from './report.js';

const out = new URL('../output/', import.meta.url);
await mkdir(out, { recursive: true });
const minFixtures = Number(process.env.VALIDATION_MIN_FIXTURES ?? 20);
try {
  const adapter = new SportmonksAdapter({ apiKey: process.env.SPORTMONKS_API_KEY, baseUrl: process.env.SPORTMONKS_BASE_URL });
  const sample = await adapter.collectValidationSample({ daysAhead: Number(process.env.VALIDATION_DAYS_AHEAD ?? 90), maxFixtures: Number(process.env.VALIDATION_MAX_FIXTURES ?? 60) });
  const report = buildReport(sample, { minFixtures });
  await writeFile(new URL('normalized-odds.json', out), JSON.stringify(sample.odds, null, 2));
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  await writeFile(new URL('report.md', out), reportMarkdown(report));
  console.log(`M0 ${report.meta.verdict}: ${report.fixturesTested} fixtures, ${sample.odds.length} normalized odds. See output/report.md`);
  process.exitCode = report.meta.verdict === 'FAIL' ? 2 : 0;
} catch (error) {
  const report = { meta: { provider: 'sportmonks', generatedAt: new Date().toISOString(), verdict: 'FAIL', executionStatus: 'NOT_EXECUTED' },
    reason: error.message, fixturesTested: 0, providerLimitations: ['No live provider evidence was collected. A real server-side SPORTMONKS_API_KEY is required.'] };
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  await writeFile(new URL('report.md', out), `# LivaSports M0 — Sportmonks validation report\n\n## FAIL — NOT EXECUTED\n\n${error.message}\n\nNo live claims can be made until a real server-side token is supplied and \`npm run validate\` completes.\n`);
  console.error(error.message);
  process.exitCode = 1;
}
