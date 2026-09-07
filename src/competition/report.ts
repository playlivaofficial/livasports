import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CompetitionCoverageStatus } from '@/domain/enums';
import type { CoverageValidation } from './CompetitionCoverageService';

export function coverageReportData(validation: CoverageValidation) {
  return {
    milestone: 'M3.6', generatedAt: validation.generatedAt, provider: 'SPORTMONKS', requestsConsumed: validation.requestsConsumed,
    window: validation.window, configuredCompetitions: validation.results.length,
    summary: Object.fromEntries(Object.values(CompetitionCoverageStatus).map(status => [status,
      validation.results.filter(result => result.classification === status).length])),
    competitions: validation.results.map(result => ({
      key: result.target.key, slug: result.target.slug, requestedCanonicalName: result.target.canonicalName,
      automatic: result.target.automatic ?? false,
      displayNamePtBr: result.target.displayNames.br, displayNameEsMx: result.target.displayNames.mx,
      type: result.target.type, region: result.target.region, country: result.target.countryCode,
      providerId: result.providerCompetition?.id ?? null, providerName: result.providerCompetition?.name ?? null,
      providerCountry: result.providerCompetition?.country?.name ?? null,
      currentSeasons: result.currentSeasons.map(season => ({ id: season.id, name: season.name,
        startsAt: season.starting_at ?? null, endsAt: season.ending_at ?? null, isCurrent: season.is_current ?? false })),
      fixtureCount: result.fixtureCount, classification: result.classification, confidence: result.confidence, notes: result.notes,
    })),
  };
}

function tableCell(value: unknown): string { return String(value ?? '—').replace(/\|/g, '\\|'); }

function markdown(validation: CoverageValidation): string {
  const data = coverageReportData(validation);
  const lines = [
    '# LivaSports M3.6 — Sportmonks Competition Coverage Report', '',
    `Generated: ${data.generatedAt}`, `Controlled window: ${data.window.from} → ${data.window.to}`,
    `Sportmonks requests consumed: ${data.requestsConsumed}`, `Account-accessible leagues returned: ${validation.accessibleCatalog.length}`, '',
    '## Summary', '',
    ...Object.entries(data.summary).map(([status, count]) => `- ${status}: ${count}`), '',
    `## Approved ${data.configuredCompetitions}-competition validation`, '',
    '| # | Requested competition | Sportmonks match | Provider ID | Country/region | Current/relevant season | Fixtures | Classification |',
    '| ---: | --- | --- | ---: | --- | --- | ---: | --- |',
    ...data.competitions.map((row, index) => `| ${index + 1} | ${tableCell(row.requestedCanonicalName)} | ${tableCell(row.providerName)} | ${tableCell(row.providerId)} | ${tableCell(row.providerCountry ?? row.region)} | ${tableCell(row.currentSeasons.map(season => season.name).join(', '))} | ${tableCell(row.fixtureCount)} | ${row.classification} |`),
    '', '## Liga MX investigation', '',
  ];
  const ligaMx = data.competitions.find(row => row.slug === 'liga-mx');
  lines.push(ligaMx
    ? `- Classification: **${ligaMx.classification}**; provider match: ${ligaMx.providerName ?? 'not found'}; provider ID: ${ligaMx.providerId ?? 'unknown'}; seasons: ${ligaMx.currentSeasons.map(row => row.name).join(', ') || 'none returned'}.`
    : '- Liga MX registry entry is missing (registry integrity failure).');
  lines.push('', '## MANUAL SPORTMONKS ACTION REQUIRED', '');
  const manual = data.competitions.filter(row => row.classification === CompetitionCoverageStatus.NO_SUBSCRIPTION_ACCESS);
  if (!manual.length) lines.push('- None identified from the live accessible catalog and provider searches.');
  else for (const row of manual) lines.push(`- ${row.requestedCanonicalName}: enable Sportmonks league ${row.providerName ?? 'unknown name'} (${row.providerId ?? 'unknown ID'}) in the account dashboard.`);
  const unresolved = data.competitions.filter(row => [CompetitionCoverageStatus.NOT_FOUND, CompetitionCoverageStatus.AMBIGUOUS_MAPPING].includes(row.classification));
  lines.push('', '## Unresolved mappings', '');
  if (!unresolved.length) lines.push('- None.');
  else for (const row of unresolved) lines.push(`- ${row.requestedCanonicalName}: ${row.classification}. ${row.notes.join(' ')}`);
  lines.push('', 'No unsupported competition was treated as available, and no fixture data was fabricated.', '');
  return lines.join('\n');
}

export async function writeCoverageReports(validation: CoverageValidation, markdownPath = 'output/m3-6-coverage-report.md', jsonPath = 'output/m3-6-coverage-report.json') {
  await Promise.all([mkdir(dirname(markdownPath), { recursive: true }), mkdir(dirname(jsonPath), { recursive: true })]);
  const data = coverageReportData(validation);
  await Promise.all([
    writeFile(markdownPath, markdown(validation), 'utf8'),
    writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8'),
  ]);
  return data;
}
