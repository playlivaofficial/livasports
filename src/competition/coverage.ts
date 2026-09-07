import type { FootballCompetitionTarget } from '@/config/footballCompetitions';
import { CompetitionCoverageStatus } from '@/domain/enums';
import type { SportmonksLeaguePayload, SportmonksSeasonPayload } from '@/providers/sportmonks/types';

export interface CompetitionCoverageResult {
  target: FootballCompetitionTarget;
  classification: CompetitionCoverageStatus;
  providerCompetition: SportmonksLeaguePayload | null;
  currentSeasons: SportmonksSeasonPayload[];
  fixtureCount: number | null;
  confidence: number | null;
  notes: string[];
}

export function normalizeCompetitionName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(the|fc)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function withoutAuthority(value: string): string {
  return value.replace(/\b(uefa|fifa|conmebol|concacaf)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreName(candidateName: string, aliases: readonly string[]): number {
  const candidate = normalizeCompetitionName(candidateName);
  const candidatePlain = withoutAuthority(candidate);
  let best = 0;
  for (const rawAlias of aliases) {
    const alias = normalizeCompetitionName(rawAlias);
    const aliasPlain = withoutAuthority(alias);
    if (candidate === alias) best = Math.max(best, 100);
    else if (candidatePlain && candidatePlain === aliasPlain) best = Math.max(best, 92);
    else {
      const candidateTokens = new Set(candidate.split(' '));
      const aliasTokens = new Set(alias.split(' '));
      const shared = [...aliasTokens].filter(token => candidateTokens.has(token)).length;
      const union = new Set([...candidateTokens, ...aliasTokens]).size;
      const similarity = union ? shared / union : 0;
      if (similarity >= 0.8) best = Math.max(best, 84);
      else if (candidateTokens.size >= 2 && aliasTokens.size >= 2 && (candidate.includes(alias) || alias.includes(candidate))) best = Math.max(best, 72);
    }
  }
  return best;
}

function countryMatches(target: FootballCompetitionTarget, candidate: SportmonksLeaguePayload): boolean {
  if (!target.countryCode) return true;
  const code = candidate.country?.iso2?.toUpperCase();
  if (code && code === target.countryCode) return true;
  const providerCountry = normalizeCompetitionName(candidate.country?.name ?? '');
  return target.countryNames.some(name => normalizeCompetitionName(name) === providerCountry);
}

export function rankedCompetitionCandidates(
  target: FootballCompetitionTarget,
  candidates: readonly SportmonksLeaguePayload[],
): Array<{ candidate: SportmonksLeaguePayload; score: number }> {
  return candidates.flatMap(candidate => {
    if (!countryMatches(target, candidate)) return [];
    const score = scoreName(candidate.name, target.lookupNames);
    return score >= 72 ? [{ candidate, score }] : [];
  }).sort((left, right) => right.score - left.score || left.candidate.id - right.candidate.id);
}

function selectCandidate(
  target: FootballCompetitionTarget,
  candidates: readonly SportmonksLeaguePayload[],
): { classification: CompetitionCoverageStatus; candidate: SportmonksLeaguePayload | null; confidence: number | null; notes: string[] } {
  const ranked = rankedCompetitionCandidates(target, candidates);
  if (!ranked.length) return { classification: CompetitionCoverageStatus.NOT_FOUND, candidate: null, confidence: null, notes: ['No confident provider-name/country match.'] };
  const [first, second] = ranked;
  if (second && first.score === second.score && first.candidate.id !== second.candidate.id) {
    return { classification: CompetitionCoverageStatus.AMBIGUOUS_MAPPING, candidate: null, confidence: first.score,
      notes: [`Ambiguous provider candidates: ${first.candidate.name} (${first.candidate.id}), ${second.candidate.name} (${second.candidate.id}).`] };
  }
  return { classification: CompetitionCoverageStatus.SUPPORTED, candidate: first.candidate, confidence: first.score, notes: [] };
}

export function selectRelevantSeasons(
  target: FootballCompetitionTarget,
  seasons: readonly SportmonksSeasonPayload[],
  now = new Date(),
): SportmonksSeasonPayload[] {
  const current = seasons.filter(season => season.is_current);
  if (current.length) return target.seasonStrategy === 'SPLIT' ? current.slice(0, 2) : current.slice(0, 1);

  const floor = new Date(now.getTime() - 540 * 86_400_000);
  const ceiling = new Date(now.getTime() + 540 * 86_400_000);
  const relevant = seasons.filter(season => {
    const starts = season.starting_at ? new Date(season.starting_at) : null;
    const ends = season.ending_at ? new Date(season.ending_at) : null;
    return (!starts || starts <= ceiling) && (!ends || ends >= floor);
  }).sort((left, right) => (new Date(right.starting_at ?? 0).getTime()) - (new Date(left.starting_at ?? 0).getTime()));

  const limit = target.seasonStrategy === 'SPLIT' ? 2 : 1;
  return (relevant.length ? relevant : [...seasons].sort((left, right) => Number(right.id) - Number(left.id))).slice(0, limit);
}

export function classifyAccessibleCoverage(
  targets: readonly FootballCompetitionTarget[],
  accessible: readonly SportmonksLeaguePayload[],
): CompetitionCoverageResult[] {
  const decisions = targets.map(target => {
    const selected = selectCandidate(target, accessible);
    const seasons = selected.candidate ? selectRelevantSeasons(target, selected.candidate.seasons ?? []) : [];
    return { target, classification: selected.classification, providerCompetition: selected.candidate,
      currentSeasons: seasons, fixtureCount: null, confidence: selected.confidence, notes: selected.notes };
  });

  const providerOwners = new Map<number, CompetitionCoverageResult[]>();
  for (const decision of decisions) {
    if (!decision.providerCompetition) continue;
    const owners = providerOwners.get(decision.providerCompetition.id) ?? [];
    owners.push(decision);
    providerOwners.set(decision.providerCompetition.id, owners);
  }
  for (const owners of providerOwners.values()) {
    if (owners.length < 2) continue;
    const rankedOwners = [...owners].sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0));
    const [best, runnerUp] = rankedOwners;
    if ((best.confidence ?? 0) > (runnerUp.confidence ?? 0)) {
      for (const owner of rankedOwners.slice(1)) {
        owner.classification = CompetitionCoverageStatus.NOT_FOUND;
        owner.notes.push(`Provider competition ${owner.providerCompetition?.id} belongs to a higher-confidence canonical target.`);
        owner.providerCompetition = null;
        owner.currentSeasons = [];
      }
      continue;
    }
    for (const owner of rankedOwners) {
      owner.classification = CompetitionCoverageStatus.AMBIGUOUS_MAPPING;
      owner.notes.push(`Provider competition ${owner.providerCompetition?.id} matched multiple canonical targets.`);
      owner.providerCompetition = null;
      owner.currentSeasons = [];
    }
  }
  return decisions;
}

export function classifyMissingAccess(
  result: CompetitionCoverageResult,
  searchedCandidates: readonly SportmonksLeaguePayload[],
): CompetitionCoverageResult {
  if (result.classification !== CompetitionCoverageStatus.NOT_FOUND) return result;
  const selected = selectCandidate(result.target, searchedCandidates);
  if (selected.classification === CompetitionCoverageStatus.SUPPORTED && selected.candidate) {
    return { ...result, classification: CompetitionCoverageStatus.NO_SUBSCRIPTION_ACCESS,
      providerCompetition: selected.candidate, confidence: selected.confidence,
      currentSeasons: selectRelevantSeasons(result.target, selected.candidate.seasons ?? []),
      notes: ['Provider competition was discoverable but is absent from the account-accessible league catalog.'] };
  }
  if (selected.classification === CompetitionCoverageStatus.AMBIGUOUS_MAPPING) {
    return { ...result, classification: selected.classification, confidence: selected.confidence, notes: selected.notes };
  }
  return result;
}

export function applyFixtureAvailability(
  result: CompetitionCoverageResult,
  fixtureCounts: ReadonlyMap<number, number>,
): CompetitionCoverageResult {
  if (result.classification !== CompetitionCoverageStatus.SUPPORTED || !result.providerCompetition) return result;
  const fixtureCount = fixtureCounts.get(result.providerCompetition.id) ?? 0;
  return { ...result, fixtureCount,
    classification: fixtureCount > 0 ? CompetitionCoverageStatus.SUPPORTED : CompetitionCoverageStatus.SUPPORTED_BUT_NO_CURRENT_FIXTURES,
    notes: fixtureCount > 0 ? result.notes : [...result.notes, 'No fixtures in the controlled active window.'] };
}

export function isIngestibleCoverage(status: CompetitionCoverageStatus): boolean {
  return status === CompetitionCoverageStatus.SUPPORTED || status === CompetitionCoverageStatus.SUPPORTED_BUT_NO_CURRENT_FIXTURES;
}
