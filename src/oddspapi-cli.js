import { mkdir, writeFile } from 'node:fs/promises';
import { OddsPapiAdapter, OddsPapiHttpError } from './provider/OddsPapiAdapter.js';
import { buildOddsPapiReport, oddsPapiReportMarkdown } from './oddspapi-report.js';

const output = new URL('../output/', import.meta.url);
await mkdir(output, { recursive: true });
const diagnosticOnly = process.argv.includes('--diagnostic');
const outputStem = diagnosticOnly ? 'oddspapi-diagnostic' : 'oddspapi-report';
let report;
let adapter;
try {
  adapter = new OddsPapiAdapter({
    apiKey: process.env.ODDSPAPI_API_KEY,
    baseUrl: process.env.ODDSPAPI_BASE_URL,
    maxBillableRequests: Number(process.env.ODDSPAPI_VALIDATION_REQUEST_BUDGET ?? (diagnosticOnly ? 4 : 14)),
  });
  const sample = await adapter.collectValidationSample({
    maxFootballFixtures: diagnosticOnly ? 1 : Number(process.env.ODDSPAPI_MAX_FOOTBALL_FIXTURES ?? 20),
    basketballFixtureLimit: diagnosticOnly ? 0 : Number(process.env.ODDSPAPI_MAX_BASKETBALL_FIXTURES ?? 3),
    diagnosticOnly,
  });
  report = buildOddsPapiReport(sample);
} catch (error) {
  report = buildOddsPapiReport(null, { executionStatus: 'NOT_EXECUTED' });
  report.executionError = error.message;
  report.failedRequest = error instanceof OddsPapiHttpError ? error.toJSON() : null;
  report.validationStages = adapter?.stages ?? [];
  report.requestsConsumed = {
    adapterBillableRequests: adapter?.billableRequests ?? 0,
    totalHttpRequests: adapter?.totalHttpRequests ?? 0,
    measuredAccountDelta: null,
  };
  if (adapter?.accountBefore) {
    try {
      const after = await adapter.account({ fresh: true });
      adapter.accountAfter = after;
      const beforeSub = adapter.accountBefore.subscriptions?.find(s => s.is_active);
      const afterSub = after.subscriptions?.find(s => s.is_active);
      if (Number.isFinite(afterSub?.request_count - beforeSub?.request_count)) {
        report.requestsConsumed.measuredAccountDelta = afterSub.request_count - beforeSub.request_count;
      }
    } catch { /* The original sanitized failure remains authoritative. */ }
  }
  // Include the final, non-billable account measurement request in the HTTP total.
  report.requestsConsumed.adapterBillableRequests = adapter?.billableRequests ?? 0;
  report.requestsConsumed.totalHttpRequests = adapter?.totalHttpRequests ?? 0;
  report.providerLimitations.unshift(`Live validation was not executed: ${error.message}`);
}
await writeFile(new URL(`${outputStem}.json`, output), JSON.stringify(report, null, 2));
await writeFile(new URL(`${outputStem}.md`, output), oddsPapiReportMarkdown(report));
console.log(`OddsPapi M0.5 ${diagnosticOnly ? 'diagnostic' : 'full run'}: ${report.overallVerdict}. See output/${outputStem}.md`);
process.exitCode = report.executionStatus === 'EXECUTED' ? 0 : 1;
